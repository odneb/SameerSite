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
  /**
   * Front-to-back extent of the *authored* layers — the wall, the window, the
   * lamp. Anything the room mesh covers ignores this and takes its position
   * from the geometry instead, so this only has to hold what the mesh doesn't.
   *
   * It is deep because the room is deep: the capture is very nearly as deep as
   * it is wide. An earlier, shallower volume made the depth cheap to light but
   * turned every layer into a sliding card the moment the camera moved.
   */
  depth: 10.2,
  /**
   * Where the middle of that range sits. The mesh pushes the interesting depth
   * forward of the origin, so the authored range is biased back to sit behind
   * it rather than straddling it.
   */
  center: -1.9,
} as const;

/**
 * The room capture, and the lens it was solved under.
 *
 * `scripts/glb-bake.mjs` fits a camera to the plate's composition and writes
 * both the depth pass and `room-transform.json`. The runtime reads that file to
 * place the mesh; the numbers here are only the things the build-time splat
 * sampler needs before the fetch resolves, expressed as ratios of the bake
 * camera's own distance so they survive any change of scale.
 *
 * Because a uniform scale about the lens leaves a projection untouched, the
 * mesh can be scaled into the site's world without moving a single pixel of the
 * composition — which is what lets the splats and the geometry occupy one space.
 */
export const ROOM = {
  url: "/scene/room.glb",
  transformUrl: "/scene/room-transform.json",
  /**
   * Dimmed hard. The mesh is here for mass, occlusion and parallax, not for
   * brightness — at anything like full range it stops being the room the cloud
   * is a surface of and starts being a render with dust on top.
   */
  brightness: 0.3,
  /** Pulls the mesh toward the plate's palette so it never reads as raw CG. */
  saturation: 0.5,
  /** Sepia, like everything else here. */
  tint: [1.14, 0.9, 0.62] as [number, number, number],
  /**
   * Highlight compression, and the main lever on the bedding.
   *
   * Set high the curve flattens the top of the mesh's range almost completely,
   * which costs the sheets far more than it costs the shadows — so the dark mass
   * behind the figures survives while the one pale surface in the capture stops
   * competing with the cloud for the eye.
   */
  highlight: 6.0,
  /**
   * Left bright on purpose. Crushed this far down the mesh is mostly silhouette,
   * and the grazing light along its edges is the whole of what you actually see
   * of it — the thing that moves when the camera does.
   */
  rimStrength: 1.15,
  rimPower: 2.4,
  /** Surface break-up, so the mesh is not the only smooth thing in frame. */
  grainAmount: 0.4,
  grainScale: 5.5,
  /** Wrap term on the practicals, so unlit faces fall off rather than clip. */
  lightWrap: 0.34,
  /** Slow brightness breathing, so the surface is never quite inert. */
  breathAmount: 0.06,
  breathSpeed: 0.09,
  /** Skipped below this tier — a phone should not pay for a backdrop. */
  minTier: "tablet",
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

/**
 * Pointer wake.
 *
 * Nothing here pushes away from the cursor. An impulse carries the direction the
 * pointer was travelling, and everything built from it preserves volume: a drag
 * along that stroke, a roll around it, and a share of a divergence-free chaotic
 * field. The result is a stirred fluid rather than a crowd parting.
 */
export const TURBULENCE = {
  /** Ring buffer size. Must match IMPULSE_COUNT in the shader. */
  slots: 14,
  /** Seconds until an impulse is fully spent. Long, on purpose. */
  life: 7.2,
  /** Exponential decay constant. Higher = slower recovery. */
  tau: 2.5,
  /** Seconds for an impulse to reach full strength. Slow enough to feel viscous. */
  attack: 0.34,
  /** World-space reach of a single impulse. */
  radiusMin: 0.85,
  radiusMax: 2.6,
  /** Displacement scale. */
  strengthMin: 0.07,
  strengthMax: 0.3,
  /** Pointer must travel this far (world units) before a new impulse spawns. */
  spawnDistance: 0.14,
  /**
   * Balance between the two gesture terms: 0 is pure drag along the stroke, 1 is
   * pure roll around it. Weighted toward the roll so the cloud curls into eddies
   * instead of sliding.
   */
  roll: 0.74,
  /**
   * How much of the displacement is handed to the ambient turbulent field rather
   * than to the gesture. This is the difference between a cursor that shoves the
   * cloud and one that disturbs the air it is suspended in — most of the way
   * across, because the gesture only needs to be legible, not literal.
   */
  chaos: 0.68,
  /** Spatial frequency of that field, in radians per world unit. */
  scale: 0.62,
  /**
   * Asymptote, in world units, for the summed displacement of all live impulses.
   * A pointer held still keeps spawning into the same spot, so without this the
   * ring buffer can stack fourteen deep and throw the cloud out of frame.
   */
  limit: 1.2,
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
