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

import { CAMERA, LIGHTS, POINTS, RENDER, ROOM } from "./config";
import {
  IMPULSE_COUNT,
  gradeShader,
  splatFragmentShader,
  splatVertexShader,
} from "./shaders";
import {
  loadRoom,
  loadRoomTransform,
  roomDepthRatios,
  type Room,
  type RoomTransform,
} from "./room";
import {
  buildTuning,
  getTuning,
  subscribeTuning,
  type BlendMode,
  type RoomBlendMode,
  type Tuning,
} from "./tuning";
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
  /** Optional room mesh rendered behind the cloud. */
  roomUrl?: string | null;
  reducedMotion?: boolean;
  onReady?: () => void;
  onProgress?: (fraction: number) => void;
};

type DeviceTier = "mobile" | "tablet" | "desktop";

const TIER_RANK: Record<DeviceTier, number> = { mobile: 0, tablet: 1, desktop: 2 };

/**
 * Set how a layer composites.
 *
 * Only `premultiplied` is actually correct for the cloud — it is what lets half a
 * million splats accumulate in any order without sorting. The rest are here
 * because seeing a scene composited wrongly is often how you work out what it is
 * supposed to be doing.
 */
function applyBlend(material: THREE.Material, mode: BlendMode | RoomBlendMode) {
  material.transparent = mode !== "opaque";

  switch (mode) {
    case "opaque":
      material.blending = THREE.NoBlending;
      break;
    case "premultiplied":
      material.blending = THREE.CustomBlending;
      material.blendSrc = THREE.OneFactor;
      material.blendDst = THREE.OneMinusSrcAlphaFactor;
      material.blendEquation = THREE.AddEquation;
      material.blendSrcAlpha = THREE.OneFactor;
      material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      break;
    case "additive":
      material.blending = THREE.AdditiveBlending;
      break;
    case "normal":
      material.blending = THREE.NormalBlending;
      break;
    case "screen":
      material.blending = THREE.CustomBlending;
      material.blendSrc = THREE.OneMinusDstColorFactor;
      material.blendDst = THREE.OneFactor;
      material.blendEquation = THREE.AddEquation;
      break;
  }

  material.needsUpdate = true;
}

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
  private splatCamera: THREE.PerspectiveCamera;
  private roomCamera: THREE.PerspectiveCamera;
  private roomPass: RenderPass | null = null;
  private splatPass: RenderPass | null = null;
  private composer: EffectComposer | null = null;
  private gradePass: ShaderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private points: THREE.Points | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private uniforms: Record<string, THREE.IUniform> = {};
  private room: Room | null = null;
  private roomTransform: RoomTransform | null = null;

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
  private splatBaseDistance = 12;
  private roomBaseDistance = 12;

  private pointerNdc = new THREE.Vector2(0, 0);
  private pointerWorld = new THREE.Vector3();
  private lastImpulseAt = new THREE.Vector3(9999, 9999, 9999);
  private lastPointerTime = 0;
  private impulseCursor = 0;
  private pointerSuspended = false;
  private raycaster = new THREE.Raycaster();
  /** The depth the pointer acts at; see TURBULENCE.planeDepth. */
  private interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  /** The live tuning, cached so the loop is not walking a store every frame. */
  private tuning: Tuning = getTuning();
  private unsubscribe: (() => void) | null = null;
  private splatBlend: BlendMode | null = null;
  private roomBlend: RoomBlendMode | null = null;
  private roomDoubleSide: boolean | null = null;

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

    this.splatCamera = new THREE.PerspectiveCamera(
      this.tuning.splatCamera.fov,
      1,
      CAMERA.near,
      CAMERA.far,
    );
    this.roomCamera = new THREE.PerspectiveCamera(
      this.tuning.roomCamera.fov,
      1,
      CAMERA.near,
      CAMERA.far,
    );
    this.splatCamera.position.set(0, 0, this.splatBaseDistance);
    this.roomCamera.position.set(0, 0, this.roomBaseDistance);
    this.interactionPlane.constant = -this.tuning.turbulence.planeDepth;
  }

  async init() {
    const buffers = await this.loadBuffers();
    if (this.disposed) return;

    this.cachedBounds = { width: buffers.bounds.width, height: buffers.bounds.height };
    this.buildPoints(buffers);
    await this.buildRoom(buffers.bounds.height);
    if (this.disposed) return;

    this.buildComposer();
    this.applyTuning();
    this.resize();

    // Everything above reads the tuning once; from here it tracks it.
    this.unsubscribe = subscribeTuning(() => this.applyTuning());

    this.options.onReady?.();
  }

  /**
   * The lens the plate was taken through, in world units.
   *
   * Splats are unprojected about this point and the room mesh is scaled about it,
   * which is the entire reason the two share a space. It is not the same as
   * `baseDistance`: that one moves with the viewport so the frame always covers.
   */
  private lensDistance(worldHeight: number, fov: number) {
    return worldHeight / 2 / Math.tan((fov * Math.PI) / 360);
  }

  private async buildRoom(worldHeight: number) {
    const { roomUrl } = this.options;
    if (!roomUrl || !this.roomTransform) return;
    if (TIER_RANK[this.tier] < TIER_RANK[ROOM.minTier]) return;

    try {
      const room = await loadRoom({
        url: roomUrl,
        transform: this.roomTransform,
        lensDistance: this.lensDistance(worldHeight, this.tuning.roomCamera.fov),
        uniforms: this.uniforms,
        maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy(),
      });
      if (this.disposed) {
        room.dispose();
        return;
      }
      this.room = room;
      this.scene.add(room.object);
    } catch {
      // A missing or broken backdrop is not worth losing the cloud over.
    }
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

    // The same solve places the mesh and positions the splats it covers, so it
    // has to be in hand before the field is built.
    if (this.options.roomUrl) {
      try {
        this.roomTransform = await loadRoomTransform(ROOM.transformUrl);
      } catch {
        this.roomTransform = null;
      }
    }

    const build = buildTuning(this.tuning);
    // The tier ceiling still applies: a phone does not get a desktop budget just
    // because somebody dragged the count up on a desktop.
    const ceiling =
      this.tier === "mobile"
        ? POINTS.countMobile
        : this.tier === "tablet"
          ? POINTS.countTablet
          : Infinity;
    const targetCount = Math.min(build.splatCount, ceiling);

    onProgress?.(0.7);
    const buffers = buildFromPlate(plate, {
      targetCount,
      build,
      depthData,
      roomDepth: this.roomTransform ? roomDepthRatios(this.roomTransform) : null,
    });
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

    // Everything with a tuning entry is seeded here and then owned by
    // `applyTuning`, which runs before the first frame.
    this.uniforms = {
      uTime: { value: 0 },
      uFocal: { value: 900 },
      uSizeScale: { value: 1 },
      uReveal: { value: 0 },
      uOpacity: { value: POINTS.opacity },
      uMotionScale: { value: this.options.reducedMotion ? 0.22 : 1 },
      uAmbient: { value: RENDER.ambient },
      uDepthHaze: { value: POINTS.depthHaze },
      uBackscatter: { value: POINTS.backscatter },
      uSwim: { value: new THREE.Vector3() },
      uShimmer: { value: new THREE.Vector4() },
      uGlintWidth: { value: 0.1 },
      uLightPos: { value: LIGHTS.map(() => new THREE.Vector3()) },
      uLightColor: { value: LIGHTS.map(() => new THREE.Vector3()) },
      uLightParams: { value: LIGHTS.map(() => new THREE.Vector4()) },
      uLightExtra: { value: LIGHTS.map(() => new THREE.Vector4()) },
      uImpulsePos: {
        value: Array.from({ length: IMPULSE_COUNT }, () => new THREE.Vector3()),
      },
      uImpulseData: {
        value: Array.from({ length: IMPULSE_COUNT }, () => new THREE.Vector4(-99, 0, 1, 0)),
      },
      uTurbLife: { value: 1 },
      uTurbTau: { value: 1 },
      uTurbAttack: { value: 0.3 },
      uTurbRoll: { value: 0.7 },
      uTurbChaos: { value: 0.7 },
      uTurbScale: { value: 0.6 },
      uTurbLimit: { value: 1.2 },
      uFalloff: { value: POINTS.falloff },
      uGlow: { value: POINTS.glow },
      uColorBrightness: { value: 1 },
      uColorSaturation: { value: 1.12 },
      uColorContrast: { value: 1 },
      uColorTint: { value: new THREE.Vector3(1, 1, 1) },
      uColorWarmth: { value: new THREE.Vector3(...RENDER.warmth) },
      uColorShadows: { value: 0 },
      uColorHighlights: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: splatVertexShader,
      fragmentShader: splatFragmentShader,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    applyBlend(this.material, "premultiplied");
    this.splatBlend = "premultiplied";

    this.points = new THREE.Points(geometry, this.material);
    // Positions are displaced in the vertex shader, so CPU-side culling would
    // pop the cloud out of view at the edges.
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
    this.scene.add(this.points);
  }

  private buildComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);

    this.roomPass = new RenderPass(this.scene, this.roomCamera);
    this.splatPass = new RenderPass(this.scene, this.splatCamera);
    this.splatPass.clear = false;
    this.composer.addPass(this.roomPass);
    this.composer.addPass(this.splatPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      RENDER.bloomStrength,
      RENDER.bloomRadius,
      RENDER.bloomThreshold,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.gradePass = new ShaderPass(gradeShader);
    this.gradePass.uniforms.uWarmth.value = new THREE.Vector3(...RENDER.warmth);
    this.gradePass.uniforms.uHalationTint.value = new THREE.Vector3(
      ...RENDER.halationTint,
    );
    this.gradePass.renderToScreen = true;
    this.composer.addPass(this.gradePass);
  }

  /** Cover distance for a lens so the plate always fills the viewport. */
  private fitDistance(
    bounds: { width: number; height: number },
    settings: Tuning["splatCamera"],
  ) {
    const aspect = Math.max(this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1), 0.2);
    const halfFov = (settings.fov * Math.PI) / 360;
    const distForHeight = bounds.height / 2 / Math.tan(halfFov);
    const distForWidth = bounds.width / 2 / (Math.tan(halfFov) * aspect);
    return Math.min(distForHeight, distForWidth) / Math.max(settings.fitPadding, 0.05);
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    const aspect = width / height;
    this.splatCamera.aspect = aspect;
    this.roomCamera.aspect = aspect;
    if (this.gradePass) {
      this.gradePass.uniforms.uAspect.value = width / Math.max(height, 1);
    }

    this.refitCamera();
  }

  /**
   * Re-derive everything that follows from each lens, without touching the render
   * targets.
   */
  private refitCamera() {
    this.splatCamera.fov = this.tuning.splatCamera.fov;
    this.roomCamera.fov = this.tuning.roomCamera.fov;
    this.splatBaseDistance = this.fitDistance(this.cachedBounds, this.tuning.splatCamera);
    this.roomBaseDistance = this.fitDistance(this.cachedBounds, this.tuning.roomCamera);
    this.splatCamera.updateProjectionMatrix();
    this.roomCamera.updateProjectionMatrix();

    const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const halfFov = (this.tuning.splatCamera.fov * Math.PI) / 360;
    if (this.uniforms.uFocal) {
      this.uniforms.uFocal.value = buffer.y / 2 / Math.tan(halfFov);
    }
  }

  /**
   * Push the whole tuning state into the scene.
   *
   * Called once before the first frame and then on every change. Values that are
   * baked into the splat buffers are not handled here — moving one of those needs
   * the field rebuilding, which is the panel's business, not this method's.
   */
  applyTuning(state: Tuning = getTuning()) {
    this.tuning = state;
    const u = this.uniforms;
    if (!u.uTime) return;

    const splats = state.splats;
    u.uOpacity.value = splats.opacity;
    u.uSizeScale.value = splats.sizeScale;
    u.uFalloff.value = splats.falloff;
    u.uGlow.value = splats.glow;
    u.uAmbient.value = splats.ambient;
    u.uDepthHaze.value = splats.depthHaze;
    u.uBackscatter.value = splats.backscatter;
    u.uGlintWidth.value = splats.glintWidth;
    u.uMotionScale.value =
      (this.options.reducedMotion ? 0.22 : 1) * splats.motionScale;
    (u.uSwim.value as THREE.Vector3).set(
      splats.swimAmplitude,
      splats.swimSpeed,
      splats.swimDepth,
    );
    (u.uShimmer.value as THREE.Vector4).set(
      splats.shimmerAmount,
      splats.shimmerSpeed,
      splats.glintSpeed,
      splats.glintStrength,
    );
    u.uColorBrightness.value = splats.colorBrightness;
    u.uColorSaturation.value = splats.colorSaturation;
    u.uColorContrast.value = splats.colorContrast;
    u.uColorShadows.value = splats.colorShadows;
    u.uColorHighlights.value = splats.colorHighlights;
    (u.uColorTint.value as THREE.Vector3).set(
      splats.colorTintR,
      splats.colorTintG,
      splats.colorTintB,
    );
    (u.uColorWarmth.value as THREE.Vector3).set(
      splats.colorWarmR,
      splats.colorWarmG,
      splats.colorWarmB,
    );

    if (this.points) this.points.visible = splats.visible;
    // Recompiles the program, so only when the mode has actually moved.
    if (this.material && this.splatBlend !== splats.blend) {
      this.splatBlend = splats.blend;
      applyBlend(this.material, splats.blend);
    }

    const positions = u.uLightPos.value as THREE.Vector3[];
    const colors = u.uLightColor.value as THREE.Vector3[];
    const params = u.uLightParams.value as THREE.Vector4[];
    const extra = u.uLightExtra.value as THREE.Vector4[];
    state.lights.forEach((light, index) => {
      if (index >= positions.length) return;
      positions[index].set(light.x, light.y, light.z);
      colors[index].set(light.r, light.g, light.b);
      params[index].set(
        light.intensity,
        light.radius,
        light.flickerAmount,
        light.flickerSpeed,
      );
      extra[index].set(
        light.backlight,
        light.phase,
        light.softness,
        light.enabled ? 1 : 0,
      );
    });

    const turbulence = state.turbulence;
    u.uTurbLife.value = turbulence.life;
    u.uTurbTau.value = turbulence.tau;
    u.uTurbAttack.value = turbulence.attack;
    u.uTurbRoll.value = turbulence.roll;
    u.uTurbChaos.value = turbulence.chaos;
    u.uTurbScale.value = turbulence.scale;
    u.uTurbLimit.value = turbulence.limit;
    this.interactionPlane.constant = -turbulence.planeDepth;

    this.applyRoomTuning(state);

    const post = state.post;
    this.renderer.toneMappingExposure = post.exposure;
    if (this.bloomPass) {
      this.bloomPass.strength = post.bloomStrength;
      this.bloomPass.radius = post.bloomRadius;
      this.bloomPass.threshold = post.bloomThreshold;
    }
    if (this.gradePass) {
      const g = this.gradePass.uniforms;
      g.uGrain.value = post.grain;
      g.uVignette.value = post.vignette;
      g.uAberration.value = post.aberration;
      g.uSaturation.value = post.saturation;
      g.uContrast.value = post.contrast;
      g.uBrightness.value = post.brightness;
      g.uShadows.value = post.shadows;
      g.uHighlights.value = post.highlights;
      g.uBlur.value = post.blur;
      g.uBlurRadius.value = post.blurRadius;
      g.uHalation.value = post.halation;
      g.uHalationRadius.value = post.halationRadius;
      g.uHalationThreshold.value = post.halationThreshold;
      (g.uWarmth.value as THREE.Vector3).set(post.warmR, post.warmG, post.warmB);
      (g.uHalationTint.value as THREE.Vector3).set(
        post.halationTintR,
        post.halationTintG,
        post.halationTintB,
      );
    }

    // The lens drives the camera, the fit and — through the lens distance — where
    // the mesh sits, so it has to be re-derived rather than just assigned.
    this.refitCamera();
  }

  private applyRoomTuning(state: Tuning) {
    const room = this.room;
    if (!room) return;

    const values = state.room;
    room.object.visible = values.visible;

    const uniforms = room.material.uniforms;
    uniforms.uBrightness.value = values.brightness;
    uniforms.uSaturation.value = values.saturation;
    uniforms.uContrast.value = values.contrast;
    uniforms.uHighlight.value = values.highlight;
    uniforms.uShadows.value = values.shadows;
    uniforms.uHighlights.value = values.highlights;
    uniforms.uGrainAmount.value = values.grainAmount;
    uniforms.uGrainScale.value = values.grainScale;
    uniforms.uRimStrength.value = values.rimStrength;
    uniforms.uRimPower.value = values.rimPower;
    uniforms.uBacklight.value = values.backlight;
    uniforms.uLightWrap.value = values.lightWrap;
    uniforms.uBreathAmount.value = values.breathAmount;
    uniforms.uBreathSpeed.value = values.breathSpeed;
    uniforms.uOpacity.value = values.opacity;
    (uniforms.uTint.value as THREE.Vector3).set(
      values.tintR,
      values.tintG,
      values.tintB,
    );
    (uniforms.uWarmth.value as THREE.Vector3).set(
      values.warmR,
      values.warmG,
      values.warmB,
    );

    if (this.roomBlend !== values.blend) {
      this.roomBlend = values.blend;
      applyBlend(room.material, values.blend);
    }
    if (this.roomDoubleSide !== values.doubleSide) {
      this.roomDoubleSide = values.doubleSide;
      room.material.side = values.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
      room.material.needsUpdate = true;
    }

    room.place(
      this.lensDistance(this.cachedBounds.height, state.roomCamera.fov),
      values,
    );
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
    this.applyOrbitCamera(
      this.splatCamera,
      this.tuning.splatCamera,
      this.splatBaseDistance,
      delta,
      elapsed,
      true,
    );

    if (this.tuning.view.linkRoomCamera) {
      this.roomCamera.position.copy(this.splatCamera.position);
      this.roomCamera.quaternion.copy(this.splatCamera.quaternion);
      return;
    }

    this.applyOrbitCamera(
      this.roomCamera,
      this.tuning.roomCamera,
      this.roomBaseDistance,
      delta,
      elapsed,
      false,
    );
  }

  private applyOrbitCamera(
    camera: THREE.PerspectiveCamera,
    settings: Tuning["splatCamera"],
    baseDistance: number,
    delta: number,
    elapsed: number,
    interactive: boolean,
  ) {
    const view = this.tuning.view;
    const ease = interactive ? 1 - Math.pow(1 - view.ease, delta * 60) : 1;

    if (interactive) {
      this.cameraOffset.lerp(this.targetOffset, ease);
      this.focusOffset.lerp(this.targetFocus, ease * 0.8);
    }

    const live = interactive && !view.freeze ? 1 : 0;
    const drift = (elapsed / Math.max(view.driftPeriod, 0.5)) * Math.PI * 2;
    const yaw =
      settings.yaw +
      (interactive
        ? live *
          (this.cameraOffset.x * view.maxYaw + Math.sin(drift) * view.driftAmplitude)
        : 0);
    const pitch =
      settings.pitch +
      (interactive
        ? live *
          (this.cameraOffset.y * view.maxPitch +
            Math.cos(drift * 0.73) * view.driftAmplitude * 0.6)
        : 0);

    const focusX = interactive ? this.focusOffset.x * live : 0;
    const focusY = interactive ? this.focusOffset.y * live : 0;
    const distance =
      baseDistance + (interactive ? this.focusOffset.z * live : 0) + settings.distance;

    camera.position.set(
      Math.sin(yaw) * distance + focusX * 0.35 + settings.targetX,
      Math.sin(pitch) * distance + focusY * 0.35 + settings.targetY,
      Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    camera.lookAt(
      focusX * 0.6 + settings.targetX,
      focusY * 0.6 + settings.targetY,
      0,
    );
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

  /**
   * Ignore the pointer entirely, e.g. while it is inside a panel that is sitting
   * over the canvas. Without this, tuning a slider stirs the cloud the whole time.
   */
  setPointerSuspended(suspended: boolean) {
    this.pointerSuspended = suspended;
    if (suspended) this.releasePointer();
  }

  /** Pointer position in CSS pixels, relative to the canvas. */
  setPointer(clientX: number, clientY: number) {
    if (this.pointerSuspended) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.pointerNdc.set(x, y);
    this.targetOffset.set(x, y);

    if (!this.points) return;

    this.raycaster.setFromCamera(this.pointerNdc, this.splatCamera);
    const hit = this.raycaster.ray.intersectPlane(this.interactionPlane, this.pointerWorld);
    if (!hit) return;

    const now = this.timer.getElapsed();
    const travelled = this.lastImpulseAt.distanceTo(this.pointerWorld);
    if (travelled < this.tuning.turbulence.spawnDistance) return;

    const dt = Math.max(now - this.lastPointerTime, 1 / 120);
    const speed = Math.min(travelled / dt, 24);
    const intensity = Math.min(1, speed / 9);

    // The direction of travel is what the wake is built from, so it has to be
    // measured before the anchor moves.
    const stroke = Math.atan2(
      this.pointerWorld.y - this.lastImpulseAt.y,
      this.pointerWorld.x - this.lastImpulseAt.x,
    );

    this.spawnImpulse(this.pointerWorld, intensity, now, stroke);
    this.lastImpulseAt.copy(this.pointerWorld);
    this.lastPointerTime = now;
  }

  private spawnImpulse(at: THREE.Vector3, intensity: number, now: number, stroke: number) {
    const positions = this.uniforms.uImpulsePos?.value as THREE.Vector3[] | undefined;
    const data = this.uniforms.uImpulseData?.value as THREE.Vector4[] | undefined;
    if (!positions || !data) return;

    const slot = this.impulseCursor % IMPULSE_COUNT;
    this.impulseCursor++;
    const turbulence = this.tuning.turbulence;

    positions[slot].copy(at);
    data[slot].set(
      now,
      turbulence.strengthMin +
        (turbulence.strengthMax - turbulence.strengthMin) * intensity,
      turbulence.radiusMin + (turbulence.radiusMax - turbulence.radiusMin) * intensity,
      stroke,
    );
  }

  /** A deliberate disturbance, e.g. a click or a nav interaction. */
  pulse(strengthScale = 1) {
    // No stroke to inherit, so give it an arbitrary one; the roll term makes it
    // read as a ripple opening out of the point either way.
    this.spawnImpulse(
      this.pointerWorld.clone(),
      Math.min(1, strengthScale),
      this.timer.getElapsed(),
      Math.random() * Math.PI * 2,
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
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.timer.dispose();
    this.points?.geometry.dispose();
    this.material?.dispose();
    this.room?.dispose();
    this.bloomPass?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
