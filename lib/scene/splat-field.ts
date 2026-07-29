/**
 * The splat field renderer.
 *
 * Owns a WebGL context, a single THREE.Points cloud of a few hundred thousand
 * oriented gaussians, the post chain, and all pointer interaction. Everything
 * animated is done on the GPU; the CPU only feeds time, camera and a small ring
 * buffer of pointer impulses.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

import { CAMERA, LIGHTS, MOTION, POINTS, RENDER, TURBULENCE } from "./config";
import {
  IMPULSE_COUNT,
  gradeShader,
  splatFragmentShader,
  splatVertexShader,
} from "./shaders";
import {
  buildFromPlate,
  loadImageData,
  parseSplatFile,
  type SplatBuffers,
} from "./splat-source";

export type SplatFieldOptions = {
  plateUrl: string;
  /** Optional grayscale depth plate (white = near). */
  depthUrl?: string | null;
  /** Optional real gaussian-splat capture; supersedes the plate entirely. */
  splatUrl?: string | null;
  reducedMotion?: boolean;
  onReady?: () => void;
  onProgress?: (fraction: number) => void;
};

type DeviceTier = "mobile" | "tablet" | "desktop";

function detectTier(): DeviceTier {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (width < 768 || (coarse && width < 1100)) return "mobile";
  if (width < 1440) return "tablet";
  return "desktop";
}

export class SplatField {
  private readonly canvas: HTMLCanvasElement;
  private readonly options: SplatFieldOptions;
  private readonly tier: DeviceTier;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private gradePass: ShaderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private points: THREE.Points | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private uniforms: Record<string, THREE.IUniform> = {};

  private timer = new THREE.Timer();
  private frame = 0;
  private running = false;
  private disposed = false;
  private revealProgress = 0;

  /** Camera aim, in world units, eased toward `targetOffset` every frame. */
  private cameraOffset = new THREE.Vector2(0, 0);
  private targetOffset = new THREE.Vector2(0, 0);
  private focusOffset = new THREE.Vector3(0, 0, 0);
  private targetFocus = new THREE.Vector3(0, 0, 0);
  private baseDistance = 12;

  private pointerNdc = new THREE.Vector2(0, 0);
  private pointerWorld = new THREE.Vector3();
  private lastImpulseAt = new THREE.Vector3(9999, 9999, 9999);
  private lastPointerTime = 0;
  private impulseCursor = 0;
  private raycaster = new THREE.Raycaster();
  private interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.9);

  private frameTimes: number[] = [];
  private downscaled = false;
  private pixelRatioCap: number;
  private cachedBounds = { width: 12, height: 6.75 };

  constructor(canvas: HTMLCanvasElement, options: SplatFieldOptions) {
    this.canvas = canvas;
    this.options = options;
    this.tier = detectTier();
    this.pixelRatioCap =
      this.tier === "mobile" ? RENDER.maxPixelRatioMobile : RENDER.maxPixelRatio;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap));
    this.renderer.setClearColor(0x070603, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = RENDER.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.timer.connect(document);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      1,
      CAMERA.near,
      CAMERA.far,
    );
    this.camera.position.set(0, 0, this.baseDistance);
  }

  async init() {
    const buffers = await this.loadBuffers();
    if (this.disposed) return;

    this.cachedBounds = { width: buffers.bounds.width, height: buffers.bounds.height };
    this.buildPoints(buffers);
    this.buildComposer();
    this.resize();
    this.options.onReady?.();
  }

  private async loadBuffers(): Promise<SplatBuffers> {
    const { splatUrl, plateUrl, depthUrl, onProgress } = this.options;

    if (splatUrl) {
      onProgress?.(0.15);
      const response = await fetch(splatUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        onProgress?.(0.75);
        return parseSplatFile(buffer);
      }
      // Fall through to the plate if the capture is missing.
    }

    onProgress?.(0.2);
    const plate = await loadImageData(plateUrl);
    onProgress?.(0.55);

    let depthData: ImageData | null = null;
    if (depthUrl) {
      try {
        depthData = await loadImageData(depthUrl);
      } catch {
        depthData = null;
      }
    }

    const targetCount =
      this.tier === "mobile"
        ? POINTS.countMobile
        : this.tier === "tablet"
          ? POINTS.countTablet
          : POINTS.countDesktop;

    onProgress?.(0.7);
    const buffers = buildFromPlate(plate, { targetCount, depthData });
    onProgress?.(0.95);
    return buffers;
  }

  private buildPoints(buffers: SplatBuffers) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(buffers.position, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(buffers.color, 3));
    geometry.setAttribute("aScale", new THREE.BufferAttribute(buffers.scale, 2));
    geometry.setAttribute("aRotation", new THREE.BufferAttribute(buffers.rotation, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(buffers.seed, 3));
    geometry.setAttribute("aLuma", new THREE.BufferAttribute(buffers.luma, 1));

    const motionScale = this.options.reducedMotion ? 0.22 : 1;

    this.uniforms = {
      uTime: { value: 0 },
      uFocal: { value: 900 },
      uSizeScale: { value: 1 },
      uReveal: { value: 0 },
      uMotionScale: { value: motionScale },
      uAmbient: { value: RENDER.ambient },
      uDepthHaze: { value: 0.3 },
      uSwim: {
        value: new THREE.Vector3(MOTION.swimAmplitude, MOTION.swimSpeed, 0.75),
      },
      uShimmer: {
        value: new THREE.Vector4(
          MOTION.shimmerAmount,
          MOTION.shimmerSpeed,
          MOTION.glintSpeed,
          MOTION.glintStrength,
        ),
      },
      uGlintWidth: { value: MOTION.glintWidth },
      uLightPos: {
        value: LIGHTS.map((light) => new THREE.Vector3(...light.position)),
      },
      uLightColor: {
        value: LIGHTS.map((light) => new THREE.Vector3(...light.color)),
      },
      uLightParams: {
        value: LIGHTS.map(
          (light) =>
            new THREE.Vector4(
              light.intensity,
              light.radius,
              light.flickerAmount,
              light.flickerSpeed,
            ),
        ),
      },
      uImpulsePos: {
        value: Array.from({ length: IMPULSE_COUNT }, () => new THREE.Vector3()),
      },
      uImpulseData: {
        value: Array.from({ length: IMPULSE_COUNT }, () => new THREE.Vector4(-99, 0, 1, 0)),
      },
      uTurbLife: { value: TURBULENCE.life },
      uTurbTau: { value: TURBULENCE.tau },
      uTurbSwirl: { value: TURBULENCE.swirl },
      uFalloff: { value: 3.2 },
      uGlow: { value: 0.16 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: splatVertexShader,
      fragmentShader: splatFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // Premultiplied alpha: order-independent enough for a soft cloud, and it
      // avoids sorting half a million splats every frame.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });

    this.points = new THREE.Points(geometry, this.material);
    // Positions are displaced in the vertex shader, so CPU-side culling would
    // pop the cloud out of view at the edges.
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  private buildComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      RENDER.bloomStrength,
      RENDER.bloomRadius,
      RENDER.bloomThreshold,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.gradePass = new ShaderPass(gradeShader);
    this.gradePass.uniforms.uGrain.value = RENDER.grain;
    this.gradePass.uniforms.uVignette.value = RENDER.vignette;
    this.gradePass.uniforms.uAberration.value = RENDER.aberration;
    this.gradePass.uniforms.uSaturation.value = RENDER.saturation;
    this.gradePass.uniforms.uContrast.value = RENDER.contrast;
    this.gradePass.uniforms.uWarmth.value = new THREE.Vector3(...RENDER.warmth);
    this.gradePass.renderToScreen = true;
    this.composer.addPass(this.gradePass);
  }

  /** Frame the plate so it always covers the viewport, whatever the aspect. */
  private fitCamera(bounds: { width: number; height: number }) {
    const aspect = Math.max(this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1), 0.2);
    const halfFov = (CAMERA.fov * Math.PI) / 360;
    const distForHeight = bounds.height / 2 / Math.tan(halfFov);
    const distForWidth = bounds.width / 2 / (Math.tan(halfFov) * aspect);
    this.baseDistance = Math.min(distForHeight, distForWidth) / CAMERA.fitPadding;
    this.camera.position.z = this.baseDistance;
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.camera.aspect = width / height;
    this.fitCamera(this.cachedBounds);
    this.camera.updateProjectionMatrix();

    // gl_PointSize is in framebuffer pixels, so the focal length must be too.
    const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const halfFov = (CAMERA.fov * Math.PI) / 360;
    if (this.uniforms.uFocal) {
      this.uniforms.uFocal.value = buffer.y / 2 / Math.tan(halfFov);
    }
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.timer.reset();
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private loop = () => {
    if (!this.running || this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);

    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.1);
    const elapsed = this.timer.getElapsed();
    const started = performance.now();

    if (this.uniforms.uTime) this.uniforms.uTime.value = elapsed;

    if (this.revealProgress < 1) {
      this.revealProgress = Math.min(1, this.revealProgress + delta / 2.4);
      if (this.uniforms.uReveal) this.uniforms.uReveal.value = this.revealProgress;
    }

    this.updateCamera(delta, elapsed);

    if (this.gradePass) this.gradePass.uniforms.uTime.value = elapsed;
    this.composer?.render(delta);

    this.trackPerformance(performance.now() - started);
  };

  private updateCamera(delta: number, elapsed: number) {
    const ease = 1 - Math.pow(1 - CAMERA.ease, delta * 60);

    this.cameraOffset.lerp(this.targetOffset, ease);
    this.focusOffset.lerp(this.targetFocus, ease * 0.8);

    // Autonomous drift so the frame is never static, even untouched.
    const drift = (elapsed / CAMERA.driftPeriod) * Math.PI * 2;
    const driftX = Math.sin(drift) * CAMERA.driftAmplitude;
    const driftY = Math.cos(drift * 0.73) * CAMERA.driftAmplitude * 0.6;

    const yaw = this.cameraOffset.x * CAMERA.maxYaw + driftX;
    const pitch = this.cameraOffset.y * CAMERA.maxPitch + driftY;

    // Orbit around the volume rather than sliding the camera sideways: the
    // parallax between depth layers is what makes it read as a real space.
    const distance = this.baseDistance + this.focusOffset.z;
    this.camera.position.set(
      Math.sin(yaw) * distance + this.focusOffset.x * 0.35,
      Math.sin(pitch) * distance + this.focusOffset.y * 0.35,
      Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    this.camera.lookAt(this.focusOffset.x * 0.6, this.focusOffset.y * 0.6, 0);
  }

  /** Step the pixel ratio down once if we are clearly missing frame budget. */
  private trackPerformance(frameMs: number) {
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length < 90) return;

    const average = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;

    if (!this.downscaled && average > 26) {
      this.downscaled = true;
      const reduced = Math.max(1, this.renderer.getPixelRatio() * 0.72);
      this.renderer.setPixelRatio(reduced);
      this.resize();
    }
  }

  /** Pointer position in CSS pixels, relative to the canvas. */
  setPointer(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.pointerNdc.set(x, y);
    this.targetOffset.set(x, y);

    if (!this.points) return;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.interactionPlane, this.pointerWorld);
    if (!hit) return;

    const now = this.timer.getElapsed();
    const travelled = this.lastImpulseAt.distanceTo(this.pointerWorld);
    if (travelled < TURBULENCE.spawnDistance) return;

    const dt = Math.max(now - this.lastPointerTime, 1 / 120);
    const speed = Math.min(travelled / dt, 24);
    const intensity = Math.min(1, speed / 9);

    this.spawnImpulse(this.pointerWorld, intensity, now);
    this.lastImpulseAt.copy(this.pointerWorld);
    this.lastPointerTime = now;
  }

  private spawnImpulse(at: THREE.Vector3, intensity: number, now: number) {
    const positions = this.uniforms.uImpulsePos?.value as THREE.Vector3[] | undefined;
    const data = this.uniforms.uImpulseData?.value as THREE.Vector4[] | undefined;
    if (!positions || !data) return;

    const slot = this.impulseCursor % IMPULSE_COUNT;
    this.impulseCursor++;

    positions[slot].copy(at);
    data[slot].set(
      now,
      TURBULENCE.strengthMin +
        (TURBULENCE.strengthMax - TURBULENCE.strengthMin) * intensity,
      TURBULENCE.radiusMin +
        (TURBULENCE.radiusMax - TURBULENCE.radiusMin) * intensity,
      0,
    );
  }

  /** A deliberate disturbance, e.g. a click or a nav interaction. */
  pulse(strengthScale = 1) {
    this.spawnImpulse(
      this.pointerWorld.clone(),
      Math.min(1, strengthScale),
      this.timer.getElapsed(),
    );
  }

  /**
   * Nudge the camera toward a point of interest, in normalized plate space
   * (0,0 = top-left, 1,1 = bottom-right). Pass null to release.
   */
  setFocus(u: number | null, v = 0.5, push = 0) {
    if (u === null) {
      this.targetFocus.set(0, 0, 0);
      return;
    }
    this.targetFocus.set(
      (u - 0.5) * this.cachedBounds.width * 0.5,
      (0.5 - v) * this.cachedBounds.height * 0.5,
      push,
    );
  }

  releasePointer() {
    this.targetOffset.set(0, 0);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.timer.dispose();
    this.points?.geometry.dispose();
    this.material?.dispose();
    this.bloomPass?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
