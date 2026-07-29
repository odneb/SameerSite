/**
 * Tuning surface for the splat field.
 *
 * Everything a non-engineer might want to nudge lives here so the renderer
 * itself stays free of magic numbers.
 */

export const WORLD = {
  /** Plate is mapped onto a volume this wide in world units. */
  width: 12,
  /** Derived from the plate aspect at build time; this is the 16:9 default. */
  height: 12 * (9 / 16),
  /** How far the cloud extends front-to-back. The whole illusion lives here. */
  depth: 3.6,
} as const;

export const CAMERA = {
  fov: 32,
  near: 0.1,
  far: 120,
  /**
   * 1.0 puts the camera exactly where the plate's own lens was, which
   * reproduces the original composition. Above 1 crops in.
   */
  fitPadding: 1.0,
  /** Max yaw/pitch the pointer can induce, in radians. Restraint is the point. */
  maxYaw: 0.075,
  maxPitch: 0.045,
  /** How quickly the camera chases its target. Lower is heavier. */
  ease: 0.022,
  /** Slow autonomous drift so the frame breathes without a pointer. */
  driftAmplitude: 0.03,
  driftPeriod: 26,
} as const;

export const POINTS = {
  /** Target splat counts by device tier. */
  countDesktop: 720_000,
  countTablet: 340_000,
  countMobile: 150_000,
  /** Atmospheric dust suspended in the volume, on top of the plate splats. */
  dustRatio: 0.012,
  /** Base splat radius in world units before per-point jitter. */
  baseRadius: 0.0145,
  radiusJitter: 0.5,
  /** Bright pixels render slightly larger, which reads as bloom-adjacent. */
  radiusLumaGain: 0.3,
  /** Anisotropy range: splats are ellipses, not dots. */
  aspectMin: 0.68,
  aspectMax: 1.28,
} as const;

export const SAMPLING = {
  /**
   * Darkness thins the field out. Set too high and the shadows disappear
   * entirely, taking the composition with them; the plate should dissolve into
   * the dark, not get cut out of it.
   */
  lumaFloor: 0.005,
  /**
   * Compresses the density curve. Near 1 the lit areas get all the splats and
   * the shadows vanish; low values keep enough motes in the dark for the
   * jacket, the wall and the bedding to hold their shape.
   */
  lumaBias: 0.35,
  /** Never drop a pixel this bright, regardless of the density budget. */
  lumaKeepAlways: 0.78,
  /** Micro-relief pulled from luminance, in world units. */
  reliefFromLuma: 0.42,
  /** Low-frequency organic wobble in the depth field, in world units. */
  reliefNoise: 0.26,
} as const;

export const MOTION = {
  /** The idle "swim". Amplitude is in world units; keep it under a splat width. */
  swimAmplitude: 0.055,
  swimSpeed: 0.16,
  /** Shimmer modulates alpha and size, not position. */
  shimmerAmount: 0.19,
  shimmerSpeed: 1.2,
  /** A slow specular band travelling across the cloud. */
  glintSpeed: 0.17,
  glintWidth: 0.1,
  glintStrength: 0.6,
} as const;

export const TURBULENCE = {
  /** Ring buffer size. Must match IMPULSE_COUNT in the shader. */
  slots: 14,
  /** Seconds until an impulse is fully spent. Long, on purpose. */
  life: 5.4,
  /** Exponential decay constant. Higher = slower recovery. */
  tau: 1.75,
  /** World-space reach of a single impulse. */
  radiusMin: 0.55,
  radiusMax: 1.85,
  /** Displacement scale. */
  strengthMin: 0.1,
  strengthMax: 0.42,
  /** Pointer must travel this far (world units) before a new impulse spawns. */
  spawnDistance: 0.12,
  /** Fraction of the impulse that swirls rather than pushes outward. */
  swirl: 0.62,
} as const;

/**
 * Practical lights, positioned to match the plate: the lamp at frame left, the
 * blinded window at frame right, and a soft key on the foreground figure.
 */
export const LIGHTS = [
  {
    name: "lamp",
    position: [-4.9, 0.35, 1.1] as [number, number, number],
    color: [1.0, 0.66, 0.31] as [number, number, number],
    intensity: 1.7,
    radius: 6.4,
    flickerAmount: 0.085,
    flickerSpeed: 2.3,
  },
  {
    name: "window",
    position: [3.5, 1.5, -1.7] as [number, number, number],
    color: [0.86, 0.78, 0.55] as [number, number, number],
    intensity: 1.2,
    radius: 7.2,
    flickerAmount: 0.03,
    flickerSpeed: 0.55,
  },
  {
    name: "key",
    position: [-1.5, 0.9, 2.6] as [number, number, number],
    color: [0.95, 0.85, 0.7] as [number, number, number],
    intensity: 0.9,
    radius: 5.6,
    flickerAmount: 0.045,
    flickerSpeed: 0.9,
  },
] as const;

export const RENDER = {
  /**
   * Kept low deliberately. The room should be lit by the practicals below, not
   * by a flat lift — ambient much above this puts an olive veil over the frame.
   */
  ambient: 0.4,
  exposure: 1.55,
  bloomStrength: 0.4,
  bloomRadius: 0.8,
  bloomThreshold: 0.72,
  grain: 0.05,
  vignette: 0.5,
  aberration: 0.0022,
  /** Final grade. ACES tonemapping pulls the warmth out; this puts it back. */
  saturation: 1.16,
  contrast: 1.03,
  warmth: [1.035, 1.0, 0.93] as [number, number, number],
  maxPixelRatio: 1.75,
  maxPixelRatioMobile: 1.3,
} as const;

/**
 * Coarse depth authored against the mock plate, in normalized image space
 * (0,0 = top-left). Ordered far to near; each region is blended over the last.
 *
 * This is the stand-in for a real capture. When a photogrammetric `.splat`
 * exists it supersedes all of this — see lib/scene/splat-source.ts.
 */
export type DepthRegion = {
  name: string;
  /** [minU, maxU] horizontal extent. */
  u: [number, number];
  /** [minV, maxV] vertical extent. */
  v: [number, number];
  /** 0 = back wall, 1 = closest to camera. */
  depth: number;
  /** Edge softness in normalized units. */
  feather: number;
};

export const DEPTH_REGIONS: DepthRegion[] = [
  { name: "back wall", u: [0.0, 1.0], v: [0.0, 1.0], depth: 0.2, feather: 0.02 },
  { name: "window", u: [0.655, 0.885], v: [0.02, 0.6], depth: 0.12, feather: 0.09 },
  { name: "lamp", u: [0.015, 0.19], v: [0.2, 0.56], depth: 0.34, feather: 0.1 },
  { name: "bed and figure", u: [0.6, 0.97], v: [0.24, 0.93], depth: 0.52, feather: 0.14 },
  { name: "sheets", u: [0.5, 1.0], v: [0.7, 1.0], depth: 0.6, feather: 0.15 },
  { name: "foreground figure", u: [0.17, 0.56], v: [0.05, 1.0], depth: 0.78, feather: 0.15 },
  { name: "cigarette smoke", u: [0.26, 0.46], v: [0.28, 0.46], depth: 0.84, feather: 0.12 },
];

/** Base depth used where no region claims a pixel. */
export const DEPTH_BASE = 0.2;

/**
 * Areas of the plate to exclude from sampling, in normalized image space.
 *
 * The reference plate has the site's own interface painted into it. Without
 * these masks every label renders twice: once as splats, once as the real HTML
 * on top of it. Delete these once a clean plate exists.
 */
export const MASK_REGIONS: Array<{ name: string; u: [number, number]; v: [number, number] }> = [
  { name: "brand", u: [0.0, 0.17], v: [0.0, 0.16] },
  { name: "menu", u: [0.88, 1.0], v: [0.0, 0.11] },
  { name: "nav list", u: [0.84, 1.0], v: [0.24, 0.75] },
  { name: "quote", u: [0.0, 0.18], v: [0.58, 0.8] },
  { name: "copyright", u: [0.0, 0.21], v: [0.9, 1.0] },
  { name: "pagination", u: [0.43, 0.57], v: [0.9, 1.0] },
];
