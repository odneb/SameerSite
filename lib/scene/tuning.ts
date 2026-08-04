/**
 * The live tuning surface.
 *
 * `config.ts` holds the defaults and the reasoning behind them. This module
 * holds the *current* values, which the tuning panel can move at runtime and
 * which every part of the renderer reads instead of reading the config directly.
 * Untouched, it is exactly the config — so this changes nothing about how the
 * scene looks until somebody opens the panel.
 *
 * Two kinds of value live here, and the difference matters:
 *
 *   - Most are uniforms or object properties, so they take effect on the next
 *     frame. `applyTuning` on the field pushes them across.
 *   - A few are baked into the splat buffers when the cloud is built — the lens,
 *     the splat budget, the sampling curves. Those are marked `rebuild` in the
 *     schema, and moving one re-runs the build.
 *
 * The panel can serialise all of this back out as JSON, which is the point: a
 * session of moving sliders ends with a block of numbers that can be pasted
 * straight back into `config.ts` as the new defaults.
 */

import {
  CAMERA,
  LIGHTS,
  MOTION,
  POINTS,
  RENDER,
  ROOM,
  SAMPLING,
  TURBULENCE,
  WORLD,
} from "./config";

/**
 * How a layer is composited. `premultiplied` is the cloud's native mode and the
 * only one that is correct for it; the others are here because seeing the scene
 * wrong is often how you work out what it should be.
 */
export const BLEND_MODES = [
  "premultiplied",
  "additive",
  "normal",
  "screen",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export const ROOM_BLEND_MODES = ["opaque", "normal", "additive", "screen"] as const;
export type RoomBlendMode = (typeof ROOM_BLEND_MODES)[number];

export type LightTuning = {
  name: string;
  enabled: boolean;
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  intensity: number;
  radius: number;
  softness: number;
  backlight: number;
  phase: number;
  flickerAmount: number;
  flickerSpeed: number;
};

/** One lens and orbit. The splat cloud and the mesh each get their own. */
export type CameraSettings = {
  fov: number;
  fitPadding: number;
  yaw: number;
  pitch: number;
  distance: number;
  targetX: number;
  targetY: number;
};

/** Per-layer colour, applied in each layer's shader before the combined grade. */
export type LayerColor = {
  brightness: number;
  saturation: number;
  contrast: number;
  tintR: number;
  tintG: number;
  tintB: number;
  warmR: number;
  warmG: number;
  warmB: number;
  shadows: number;
  highlights: number;
};

export type Tuning = {
  splatCamera: CameraSettings;
  roomCamera: CameraSettings;
  /** Pointer sway and drift — only the splat camera follows these. */
  view: {
    linkRoomCamera: boolean;
    maxYaw: number;
    maxPitch: number;
    ease: number;
    driftAmplitude: number;
    driftPeriod: number;
    freeze: boolean;
  };
  splats: {
    visible: boolean;
    opacity: number;
    sizeScale: number;
    falloff: number;
    glow: number;
    blend: BlendMode;
    ambient: number;
    depthHaze: number;
    backscatter: number;
    motionScale: number;
    swimAmplitude: number;
    swimSpeed: number;
    swimDepth: number;
    shimmerAmount: number;
    shimmerSpeed: number;
    glintSpeed: number;
    glintWidth: number;
    glintStrength: number;
    colorBrightness: number;
    colorSaturation: number;
    colorContrast: number;
    colorTintR: number;
    colorTintG: number;
    colorTintB: number;
    colorWarmR: number;
    colorWarmG: number;
    colorWarmB: number;
    colorShadows: number;
    colorHighlights: number;
  };
  room: {
    driveSplats: boolean;
    backdropVisible: boolean;
    backdropOpacity: number;
    visible: boolean;
    opacity: number;
    blend: RoomBlendMode;
    doubleSide: boolean;
    brightness: number;
    saturation: number;
    contrast: number;
    highlight: number;
    tintR: number;
    tintG: number;
    tintB: number;
    warmR: number;
    warmG: number;
    warmB: number;
    shadows: number;
    highlights: number;
    grainAmount: number;
    grainScale: number;
    rimStrength: number;
    rimPower: number;
    backlight: number;
    lightWrap: number;
    breathAmount: number;
    breathSpeed: number;
    /** Placed on top of the baked solve, pivoting on the bake's own target. */
    offsetX: number;
    offsetY: number;
    offsetZ: number;
    rotateX: number;
    rotateY: number;
    rotateZ: number;
    scale: number;
  };
  lights: LightTuning[];
  turbulence: {
    life: number;
    tau: number;
    attack: number;
    roll: number;
    chaos: number;
    scale: number;
    limit: number;
    radiusMin: number;
    radiusMax: number;
    strengthMin: number;
    strengthMax: number;
    spawnDistance: number;
    planeDepth: number;
  };
  post: {
    exposure: number;
    bloomStrength: number;
    bloomRadius: number;
    bloomThreshold: number;
    brightness: number;
    contrast: number;
    saturation: number;
    shadows: number;
    highlights: number;
    warmR: number;
    warmG: number;
    warmB: number;
    vignette: number;
    grain: number;
    aberration: number;
    blur: number;
    blurRadius: number;
    halation: number;
    halationRadius: number;
    halationThreshold: number;
    halationTintR: number;
    halationTintG: number;
    halationTintB: number;
  };
  build: {
    splatCount: number;
    dustRatio: number;
    baseRadius: number;
    radiusJitter: number;
    radiusLumaGain: number;
    aspectMin: number;
    aspectMax: number;
    lumaFloor: number;
    lumaBias: number;
    lumaKeepAlways: number;
    reliefFromLuma: number;
    reliefNoise: number;
    worldWidth: number;
    worldDepth: number;
    worldCenter: number;
  };
};

function cameraDefaults(): CameraSettings {
  return {
    fov: CAMERA.fov,
    fitPadding: CAMERA.fitPadding,
    yaw: 0,
    pitch: 0,
    distance: 0,
    targetX: 0,
    targetY: 0,
  };
}


function defaults(): Tuning {
  const camera = cameraDefaults();
  return {
    splatCamera: { ...camera },
    roomCamera: { ...camera },
    view: {
      linkRoomCamera: true,
      maxYaw: CAMERA.maxYaw,
      maxPitch: CAMERA.maxPitch,
      ease: CAMERA.ease,
      driftAmplitude: 0,
      driftPeriod: CAMERA.driftPeriod,
      freeze: true,
    },
    splats: {
      visible: true,
      opacity: POINTS.opacity,
      sizeScale: 1.08,
      falloff: POINTS.falloff,
      glow: POINTS.glow,
      blend: "premultiplied",
      ambient: RENDER.ambient,
      depthHaze: POINTS.depthHaze,
      backscatter: POINTS.backscatter,
      motionScale: 1,
      swimAmplitude: MOTION.swimAmplitude,
      swimSpeed: MOTION.swimSpeed,
      swimDepth: 0.75,
      shimmerAmount: MOTION.shimmerAmount,
      shimmerSpeed: MOTION.shimmerSpeed,
      glintSpeed: MOTION.glintSpeed,
      glintWidth: MOTION.glintWidth,
      glintStrength: MOTION.glintStrength,
      colorBrightness: 1.14,
      colorSaturation: 1.06,
      colorContrast: 1.02,
      colorTintR: 1,
      colorTintG: 1,
      colorTintB: 1,
      colorWarmR: RENDER.warmth[0],
      colorWarmG: RENDER.warmth[1],
      colorWarmB: RENDER.warmth[2],
      colorShadows: 0.06,
      colorHighlights: -0.03,
    },
    room: {
      driveSplats: true,
      backdropVisible: true,
      backdropOpacity: 1,
      visible: false,
      opacity: ROOM.opacity,
      blend: "opaque",
      doubleSide: false,
      brightness: ROOM.brightness,
      saturation: ROOM.saturation,
      contrast: 1,
      highlight: ROOM.highlight,
      tintR: ROOM.tint[0],
      tintG: ROOM.tint[1],
      tintB: ROOM.tint[2],
      warmR: ROOM.tint[0],
      warmG: ROOM.tint[1],
      warmB: ROOM.tint[2],
      shadows: 0,
      highlights: 0,
      grainAmount: ROOM.grainAmount,
      grainScale: ROOM.grainScale,
      rimStrength: ROOM.rimStrength,
      rimPower: ROOM.rimPower,
      backlight: ROOM.backlight,
      lightWrap: ROOM.lightWrap,
      breathAmount: ROOM.breathAmount,
      breathSpeed: ROOM.breathSpeed,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      rotateX: 0,
      rotateY: 0,
      rotateZ: 0,
      scale: 1,
    },
    lights: LIGHTS.map((light) => ({
      name: light.name,
      enabled: true,
      x: light.position[0],
      y: light.position[1],
      z: light.position[2],
      r: light.color[0],
      g: light.color[1],
      b: light.color[2],
      intensity: light.intensity,
      radius: light.radius,
      softness: light.softness,
      backlight: light.backlight,
      phase: light.phase,
      flickerAmount: light.flickerAmount,
      flickerSpeed: light.flickerSpeed,
    })),
    turbulence: {
      life: TURBULENCE.life,
      tau: TURBULENCE.tau,
      attack: TURBULENCE.attack,
      roll: TURBULENCE.roll,
      chaos: TURBULENCE.chaos,
      scale: TURBULENCE.scale,
      limit: TURBULENCE.limit,
      radiusMin: TURBULENCE.radiusMin,
      radiusMax: TURBULENCE.radiusMax,
      strengthMin: TURBULENCE.strengthMin,
      strengthMax: TURBULENCE.strengthMax,
      spawnDistance: TURBULENCE.spawnDistance,
      planeDepth: TURBULENCE.planeDepth,
    },
    post: {
      exposure: RENDER.exposure,
      bloomStrength: RENDER.bloomStrength,
      bloomRadius: RENDER.bloomRadius,
      bloomThreshold: RENDER.bloomThreshold,
      brightness: RENDER.brightness,
      contrast: RENDER.contrast,
      saturation: RENDER.saturation,
      shadows: RENDER.shadows,
      highlights: RENDER.highlights,
      warmR: RENDER.warmth[0],
      warmG: RENDER.warmth[1],
      warmB: RENDER.warmth[2],
      vignette: RENDER.vignette,
      grain: RENDER.grain,
      aberration: RENDER.aberration,
      blur: RENDER.blur,
      blurRadius: RENDER.blurRadius,
      halation: RENDER.halation,
      halationRadius: RENDER.halationRadius,
      halationThreshold: RENDER.halationThreshold,
      halationTintR: RENDER.halationTint[0],
      halationTintG: RENDER.halationTint[1],
      halationTintB: RENDER.halationTint[2],
    },
    build: {
      splatCount: POINTS.countDesktop,
      dustRatio: POINTS.dustRatio,
      baseRadius: POINTS.baseRadius,
      radiusJitter: POINTS.radiusJitter,
      radiusLumaGain: POINTS.radiusLumaGain,
      aspectMin: POINTS.aspectMin,
      aspectMax: POINTS.aspectMax,
      lumaFloor: SAMPLING.lumaFloor,
      lumaBias: SAMPLING.lumaBias,
      lumaKeepAlways: SAMPLING.lumaKeepAlways,
      reliefFromLuma: SAMPLING.reliefFromLuma,
      reliefNoise: SAMPLING.reliefNoise,
      worldWidth: WORLD.width,
      worldDepth: WORLD.depth,
      worldCenter: WORLD.center,
    },
  };
}

/**
 * The build-time half of the tuning, snapshotted when the cloud is built.
 *
 * `splat-source` runs long before any of this is on screen and has no business
 * reaching into a live store mid-loop, so it is handed a frozen copy.
 */
export type BuildTuning = Tuning["build"] & { fov: number };

export function buildTuning(state: Tuning = current): BuildTuning {
  return { ...state.build, fov: state.splatCamera.fov };
}

let current = defaults();
const listeners = new Set<() => void>();

/**
 * A new object identity on every change, so `useSyncExternalStore` sees it.
 * The tree is small; copying it costs nothing next to a frame.
 */
function emit() {
  current = structuredClone(current);
  for (const listener of listeners) listener();
}

export function getTuning() {
  return current;
}

export function subscribeTuning(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type Value = number | boolean | string;

/** Read a dotted path, e.g. `lights.1.intensity`. */
export function readPath(state: Tuning, path: string): Value {
  let node: unknown = state;
  for (const key of path.split(".")) {
    node = (node as Record<string, unknown>)[key];
  }
  return node as Value;
}

export function setPath(path: string, value: Value) {
  const keys = path.split(".");
  const last = keys.pop();
  if (!last) return;

  let node: Record<string, unknown> = current as unknown as Record<string, unknown>;
  for (const key of keys) {
    node = node[key] as Record<string, unknown>;
  }
  if (node[last] === value) return;
  node[last] = value;
  emit();
}

export function resetTuning() {
  current = defaults();
  emit();
}

export function resetSection(section: keyof Tuning) {
  const fresh = defaults();
  (current as Record<string, unknown>)[section] = fresh[section];
  emit();
}

export function exportTuning() {
  return JSON.stringify(current, null, 2);
}

/**
 * Only the values that have actually been moved.
 *
 * This is the one worth pasting into a conversation: it says what changed and
 * nothing else, so the defaults it should replace are unambiguous.
 */
export function exportChanges() {
  const base = defaults() as unknown as Record<string, unknown>;
  const now = current as unknown as Record<string, unknown>;

  const walk = (a: unknown, b: unknown): unknown => {
    if (Array.isArray(a) && Array.isArray(b)) {
      const items = b.map((item, index) => walk(a[index], item));
      return items.some((item) => item !== undefined) ? items : undefined;
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(b)) {
        const diff = walk(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        );
        if (diff !== undefined) out[key] = diff;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    }
    return a === b ? undefined : b;
  };

  // Names are carried through untouched so a changed light is identifiable.
  const diff = walk(base, now);
  if (diff === undefined) return "{}";
  return JSON.stringify(diff, null, 2);
}

export function importTuning(json: string) {
  const parsed = JSON.parse(json) as Partial<Tuning> & {
    camera?: Partial<CameraSettings> & {
      maxYaw?: number;
      maxPitch?: number;
      ease?: number;
      driftAmplitude?: number;
      driftPeriod?: number;
      freeze?: boolean;
    };
  };

  // Older exports used a single `camera` block for both layers.
  if (parsed.camera && !parsed.splatCamera) {
    const {
      maxYaw,
      maxPitch,
      ease,
      driftAmplitude,
      driftPeriod,
      freeze,
      ...lens
    } = parsed.camera;
    parsed.splatCamera = lens as CameraSettings;
    parsed.roomCamera = { ...(lens as CameraSettings) };
    parsed.view = {
      ...defaults().view,
      ...(parsed.view ?? {}),
      ...(maxYaw !== undefined ? { maxYaw } : {}),
      ...(maxPitch !== undefined ? { maxPitch } : {}),
      ...(ease !== undefined ? { ease } : {}),
      ...(driftAmplitude !== undefined ? { driftAmplitude } : {}),
      ...(driftPeriod !== undefined ? { driftPeriod } : {}),
      ...(freeze !== undefined ? { freeze } : {}),
    };
    delete parsed.camera;
  }

  const merge = (target: unknown, source: unknown): unknown => {
    if (Array.isArray(target) && Array.isArray(source)) {
      return target.map((item, index) =>
        index < source.length ? merge(item, source[index]) : item,
      );
    }
    if (target && source && typeof target === "object" && typeof source === "object") {
      const out = { ...(target as Record<string, unknown>) };
      for (const key of Object.keys(source as Record<string, unknown>)) {
        if (!(key in out)) continue;
        out[key] = merge(out[key], (source as Record<string, unknown>)[key]);
      }
      return out;
    }
    return source ?? target;
  };
  current = merge(defaults(), parsed) as Tuning;
  emit();
}

/* -------------------------------------------------------------------------- */
/*  Schema                                                                    */
/* -------------------------------------------------------------------------- */

export type Control =
  | {
      kind: "range";
      path: string;
      label: string;
      min: number;
      max: number;
      step: number;
      /** Changing this re-runs the cloud build rather than a uniform update. */
      rebuild?: boolean;
      hint?: string;
    }
  | { kind: "toggle"; path: string; label: string; hint?: string }
  | {
      kind: "select";
      path: string;
      label: string;
      options: readonly string[];
      hint?: string;
    };

export type Section = {
  id: string;
  /** Which tuning block reset applies to. Defaults to `id` when it is a top-level key. */
  resetKey?: keyof Tuning;
  title: string;
  hint?: string;
  /** Open on first paint. Only the ones you reach for immediately. */
  open?: boolean;
  controls: Control[];
};

const range = (
  path: string,
  label: string,
  min: number,
  max: number,
  step: number,
  extra: { rebuild?: boolean; hint?: string } = {},
): Control => ({ kind: "range", path, label, min, max, step, ...extra });

const toggle = (path: string, label: string, hint?: string): Control => ({
  kind: "toggle",
  path,
  label,
  hint,
});

function lightControls(index: number, name: string): Control[] {
  const at = (key: string) => `lights.${index}.${key}`;
  return [
    toggle(at("enabled"), `${name} — on`),
    range(at("x"), "x", -14, 14, 0.05),
    range(at("y"), "y", -10, 10, 0.05),
    range(at("z"), "z", -14, 14, 0.05, {
      hint: "Negative is behind the subjects, shining toward the lens.",
    }),
    range(at("intensity"), "intensity", 0, 6, 0.01),
    range(at("radius"), "reach", 0.5, 30, 0.1),
    range(at("softness"), "softness", 0.4, 4, 0.01, {
      hint: "Exponent on the falloff. Lower is a bigger, gentler source.",
    }),
    range(at("backlight"), "backlight", 0, 4, 0.01, {
      hint: "Forward scatter toward the camera. The backlit glow.",
    }),
    range(at("phase"), "shaft", 0.5, 16, 0.1, {
      hint: "How tightly the scatter hugs the light direction.",
    }),
    range(at("r"), "red", 0, 2, 0.01),
    range(at("g"), "green", 0, 2, 0.01),
    range(at("b"), "blue", 0, 2, 0.01),
    range(at("flickerAmount"), "flicker", 0, 0.5, 0.005),
    range(at("flickerSpeed"), "flicker speed", 0, 8, 0.05),
  ];
}

function cameraControls(
  prefix: string,
  label: string,
  opts: { rebuildFov?: boolean; hint?: string } = {},
): Control[] {
  return [
    range(`${prefix}.fov`, `${label} — lens`, 8, 90, 0.5, {
      rebuild: opts.rebuildFov,
      hint: opts.rebuildFov ? "Rebuilds: the splat solve is tied to this lens." : opts.hint,
    }),
    range(`${prefix}.fitPadding`, `${label} — fit`, 0.5, 2, 0.005),
    range(`${prefix}.yaw`, `${label} — yaw`, -0.8, 0.8, 0.002),
    range(`${prefix}.pitch`, `${label} — pitch`, -0.8, 0.8, 0.002),
    range(`${prefix}.distance`, `${label} — dolly`, -9, 9, 0.02),
    range(`${prefix}.targetX`, `${label} — target x`, -6, 6, 0.02),
    range(`${prefix}.targetY`, `${label} — target y`, -6, 6, 0.02),
  ];
}

function splatColorControls(): Control[] {
  return [
    range("splats.colorBrightness", "brightness", 0, 3, 0.005),
    range("splats.colorSaturation", "saturation", 0, 2.5, 0.005),
    range("splats.colorContrast", "contrast", 0.3, 2.5, 0.005),
    range("splats.colorShadows", "shadows", -1, 1, 0.005),
    range("splats.colorHighlights", "highlights", -1, 1, 0.005),
    range("splats.colorTintR", "tint red", 0, 2, 0.005),
    range("splats.colorTintG", "tint green", 0, 2, 0.005),
    range("splats.colorTintB", "tint blue", 0, 2, 0.005),
    range("splats.colorWarmR", "tone red", 0.5, 1.5, 0.002),
    range("splats.colorWarmG", "tone green", 0.5, 1.5, 0.002),
    range("splats.colorWarmB", "tone blue", 0.5, 1.5, 0.002),
  ];
}

export const SECTIONS: Section[] = [
  {
    id: "splatCamera",
    title: "splat camera",
    hint: "Used only when drive splat placement is off. Otherwise the 3d camera owns the cloud.",
    open: false,
    controls: cameraControls("splatCamera", "splat", { rebuildFov: true }),
  },
  {
    id: "roomCamera",
    title: "3d camera",
    hint: "FOV only — camera stays on the plate axis. Move/rotate/scale the mesh+splats under 3d scene.",
    open: true,
    controls: [
      range("roomCamera.fov", "fov", 14, 90, 0.25, { rebuild: true }),
      range("roomCamera.fitPadding", "fit padding", 0.5, 1.5, 0.005, { rebuild: true }),
    ],
  },
  {
    id: "view",
    title: "view motion",
    controls: [
      toggle(
        "view.linkRoomCamera",
        "link 3d camera to splat",
        "When on, the mesh camera copies the splat camera every frame.",
      ),
      toggle("view.freeze", "freeze splat sway", "Stops drift and pointer sway on the cloud."),
      range("view.maxYaw", "sway yaw", 0, 0.6, 0.002),
      range("view.maxPitch", "sway pitch", 0, 0.6, 0.002),
      range("view.ease", "sway ease", 0.002, 0.3, 0.001),
      range("view.driftAmplitude", "drift", 0, 0.3, 0.001),
      range("view.driftPeriod", "drift period", 3, 90, 0.5),
    ],
  },
  {
    id: "splats",
    title: "splats",
    controls: [
      toggle("splats.visible", "visible"),
      range("splats.opacity", "opacity", 0, 1, 0.005),
      { kind: "select", path: "splats.blend", label: "blend", options: BLEND_MODES },
      range("splats.sizeScale", "size", 0.1, 4, 0.01),
      range("splats.falloff", "edge falloff", 0.5, 12, 0.05),
      range("splats.glow", "core glow", 0, 1.5, 0.005),
      range("splats.backscatter", "backscatter", 0, 4, 0.01, {
        hint: "Master on the light the cloud throws toward the lens.",
      }),
      range("splats.ambient", "ambient", 0, 2, 0.005),
      range("splats.depthHaze", "depth haze", 0, 1, 0.005),
      range("splats.motionScale", "motion", 0, 3, 0.01),
      range("splats.swimAmplitude", "swim", 0, 0.4, 0.001),
      range("splats.swimSpeed", "swim speed", 0, 1.5, 0.005),
      range("splats.swimDepth", "swim depth", 0, 3, 0.01),
      range("splats.shimmerAmount", "shimmer", 0, 1, 0.005),
      range("splats.shimmerSpeed", "shimmer speed", 0, 6, 0.02),
      range("splats.glintStrength", "glint", 0, 3, 0.01),
      range("splats.glintSpeed", "glint speed", 0, 2, 0.005),
      range("splats.glintWidth", "glint width", 0.01, 1, 0.005),
    ],
  },
  {
    id: "splatColor",
    resetKey: "splats",
    title: "splat colour",
    hint: "Applied in the splat shader, before the combined grade.",
    controls: splatColorControls(),
  },
  {
    id: "room",
    title: "3d scene",
    hint: "Mesh transform drives splat placement. Backdrop is the static plate behind everything.",
    controls: [
      toggle("room.driveSplats", "drive splat placement", "Splats follow mesh moves, rotates and scale."),
      toggle("room.backdropVisible", "static backdrop", "Plate PNG behind mesh and splats — fills gaps when particles part."),
      range("room.backdropOpacity", "backdrop opacity", 0, 1, 0.005),
      toggle("room.visible", "mesh visible"),
      range("room.opacity", "opacity", 0, 1, 0.005),
      {
        kind: "select",
        path: "room.blend",
        label: "blend",
        options: ROOM_BLEND_MODES,
      },
      toggle("room.doubleSide", "double sided"),
      range("room.rotateY", "rotate y", -180, 180, 0.25),
      range("room.rotateX", "rotate x", -180, 180, 0.25),
      range("room.rotateZ", "rotate z", -180, 180, 0.25),
      range("room.offsetX", "move x", -12, 12, 0.02),
      range("room.offsetY", "move y", -12, 12, 0.02),
      range("room.offsetZ", "move z", -12, 12, 0.02),
      range("room.scale", "scale", 0.1, 4, 0.005),
      range("room.rimStrength", "rim", 0, 5, 0.01),
      range("room.rimPower", "rim tightness", 0.2, 8, 0.02),
      range("room.backlight", "backlight rim", 0, 6, 0.01),
      range("room.lightWrap", "light wrap", 0, 1.5, 0.005),
      range("room.highlight", "highlight rolloff", 0, 20, 0.05),
      range("room.grainAmount", "grain", 0, 1.5, 0.005),
      range("room.grainScale", "grain scale", 0.2, 20, 0.05),
      range("room.breathAmount", "breath", 0, 0.5, 0.002),
      range("room.breathSpeed", "breath speed", 0, 2, 0.005),
    ],
  },
  {
    id: "roomColor",
    resetKey: "room",
    title: "3d colour",
    hint: "Applied in the mesh shader, before the combined grade.",
    controls: [
      range("room.brightness", "brightness", 0, 3, 0.005),
      range("room.saturation", "saturation", 0, 2, 0.005),
      range("room.contrast", "contrast", 0.3, 2.5, 0.005),
      range("room.shadows", "shadows", -1, 1, 0.005),
      range("room.highlights", "highlights", -1, 1, 0.005),
      range("room.tintR", "tint red", 0, 2, 0.005),
      range("room.tintG", "tint green", 0, 2, 0.005),
      range("room.tintB", "tint blue", 0, 2, 0.005),
      range("room.warmR", "tone red", 0.5, 1.5, 0.002),
      range("room.warmG", "tone green", 0.5, 1.5, 0.002),
      range("room.warmB", "tone blue", 0.5, 1.5, 0.002),
    ],
  },
  {
    id: "lights",
    title: "lights",
    hint: "The lamp and window sit behind the subjects on purpose.",
    controls: LIGHTS.flatMap((light, index) => lightControls(index, light.name)),
  },
  {
    id: "post",
    title: "combined grade",
    hint: "Sits on top of both layers — bloom, halation, and the final print look.",
    controls: [
      range("post.exposure", "exposure", 0.1, 4, 0.005),
      range("post.brightness", "brightness", 0, 3, 0.005),
      range("post.contrast", "contrast", 0.3, 2.5, 0.005),
      range("post.saturation", "saturation", 0, 2.5, 0.005),
      range("post.shadows", "shadows", -1, 1, 0.005, {
        hint: "Positive lifts them out of the black.",
      }),
      range("post.highlights", "highlights", -1, 1, 0.005, {
        hint: "Positive pulls them back down.",
      }),
      range("post.warmR", "tone red", 0.5, 1.5, 0.002),
      range("post.warmG", "tone green", 0.5, 1.5, 0.002),
      range("post.warmB", "tone blue", 0.5, 1.5, 0.002),
      range("post.bloomStrength", "bloom", 0, 3, 0.005),
      range("post.bloomRadius", "bloom radius", 0, 2, 0.005),
      range("post.bloomThreshold", "bloom threshold", 0, 1.5, 0.005),
      range("post.halation", "halation", 0, 1.5, 0.005),
      range("post.halationRadius", "halation radius", 0.001, 0.06, 0.0005),
      range("post.halationThreshold", "halation threshold", 0, 1.5, 0.005),
      range("post.halationTintR", "halation red", 0, 2, 0.005),
      range("post.halationTintG", "halation green", 0, 2, 0.005),
      range("post.halationTintB", "halation blue", 0, 2, 0.005),
      range("post.blur", "blur", 0, 1, 0.005),
      range("post.blurRadius", "blur radius", 0.0002, 0.02, 0.0002),
      range("post.vignette", "vignette", 0, 2, 0.005),
      range("post.grain", "grain", 0, 0.3, 0.001),
      range("post.aberration", "aberration", 0, 0.02, 0.0002),
    ],
  },
  {
    id: "turbulence",
    title: "hover",
    hint: "The wake the pointer leaves in the cloud.",
    controls: [
      range("turbulence.chaos", "chaos", 0, 1, 0.005, {
        hint: "How much is handed to the ambient field vs. the gesture.",
      }),
      range("turbulence.roll", "roll", 0, 1, 0.005, {
        hint: "0 drags along the stroke, 1 curls around it.",
      }),
      range("turbulence.scale", "field scale", 0.05, 3, 0.005),
      range("turbulence.limit", "ceiling", 0.05, 6, 0.01),
      range("turbulence.strengthMin", "strength min", 0, 1, 0.005),
      range("turbulence.strengthMax", "strength max", 0, 2, 0.005),
      range("turbulence.radiusMin", "reach min", 0.1, 6, 0.01),
      range("turbulence.radiusMax", "reach max", 0.1, 10, 0.01),
      range("turbulence.attack", "attack", 0.01, 2, 0.005),
      range("turbulence.tau", "release", 0.1, 12, 0.02),
      range("turbulence.life", "life", 0.5, 24, 0.05),
      range("turbulence.spawnDistance", "spawn spacing", 0.01, 1.5, 0.005),
      range("turbulence.planeDepth", "acts at depth", -6, 8, 0.02, {
        hint: "World z of the plane the pointer stirs.",
      }),
    ],
  },
  {
    id: "build",
    title: "cloud build",
    hint: "Every control here rebuilds the cloud, which takes a moment.",
    controls: [
      range("build.splatCount", "splat count", 20_000, 1_600_000, 10_000, {
        rebuild: true,
      }),
      range("build.baseRadius", "splat radius", 0.002, 0.06, 0.0005, { rebuild: true }),
      range("build.radiusJitter", "radius jitter", 0, 1.5, 0.005, { rebuild: true }),
      range("build.radiusLumaGain", "radius from luma", 0, 2, 0.005, { rebuild: true }),
      range("build.aspectMin", "aspect min", 0.1, 2, 0.005, { rebuild: true }),
      range("build.aspectMax", "aspect max", 0.1, 3, 0.005, { rebuild: true }),
      range("build.dustRatio", "dust", 0, 0.2, 0.001, { rebuild: true }),
      range("build.lumaFloor", "shadow floor", 0, 0.4, 0.001, { rebuild: true }),
      range("build.lumaBias", "density curve", 0.05, 2, 0.005, { rebuild: true }),
      range("build.lumaKeepAlways", "keep above", 0.2, 1, 0.005, { rebuild: true }),
      range("build.reliefFromLuma", "relief from luma", 0, 2, 0.005, { rebuild: true }),
      range("build.reliefNoise", "relief noise", 0, 2, 0.005, { rebuild: true }),
      range("build.worldWidth", "world width", 4, 30, 0.1, { rebuild: true }),
      range("build.worldDepth", "world depth", 0.5, 30, 0.1, { rebuild: true }),
      range("build.worldCenter", "world centre", -10, 10, 0.05, { rebuild: true }),
    ],
  },
];

/** Paths that only take effect on a rebuild. */
export const REBUILD_PATHS = new Set(
  SECTIONS.flatMap((section) =>
    section.controls
      .filter((control) => control.kind === "range" && control.rebuild)
      .map((control) => control.path),
  ),
);
