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
  center: 0,
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
  /**
   * How much a light behind a surface amplifies its rim.
   *
   * With the practicals now shining toward the lens, most of the mesh we can see
   * is its unlit side, and the edge is all the evidence of the light there is.
   */
  backlight: 1.6,
  /** Overall opacity. Below 1 the mesh has to be blended rather than written. */
  opacity: 1,
  /** Slow brightness breathing, so the surface is never quite inert. */
  breathAmount: 0.06,
  breathSpeed: 0.09,
  /** Skipped below this tier — a phone should not pay for a backdrop. */
  minTier: "tablet",
} as const;

export const CAMERA = {
  fov: 23.5,
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
  countDesktop: 1_450_000,
  countTablet: 520_000,
  countMobile: 220_000,
  /** Atmospheric dust suspended in the volume, on top of the plate splats. */
  dustRatio: 0.001,
  /** Base splat radius in world units before per-point jitter. */
  baseRadius: 0.0225,
  radiusJitter: 0.1,
  /** Bright pixels render slightly larger, which reads as bloom-adjacent. */
  radiusLumaGain: 0.08,
  /** Anisotropy range: splats are ellipses, not dots. */
  aspectMin: 0.88,
  aspectMax: 1.08,
  /** Cloud opacity, before shimmer and the reveal. */
  opacity: 1,
  /** Gaussian tightness within a sprite — lower = softer overlap, more resolve. */
  falloff: 1.55,
  glow: 0.04,
  /**
   * Master on the forward-scattering term — the light a splat throws toward the
   * camera when a source is behind it. This is what makes the cloud read as lit
   * air rather than as dust with a lamp pointed at it.
   */
  backscatter: 0.38,
  /** Depth thinning, so the far side of the volume reads as further away. */
  depthHaze: 0.05,
} as const;

export const SAMPLING = {
  /**
   * Darkness thins the field out. Set too high and the shadows disappear
   * entirely, taking the composition with them; the plate should dissolve into
   * the dark, not get cut out of it.
   */
  lumaFloor: 0.001,
  /**
   * Compresses the density curve. Near 1 the lit areas get all the splats and
   * the shadows vanish; low values keep enough motes in the dark for the
   * palms, walls and door frame to hold their shape.
   */
  lumaBias: 0.1,
  /** Never drop a pixel this bright, regardless of the density budget. */
  lumaKeepAlways: 0.36,
  /** Micro-relief pulled from luminance, in world units. */
  reliefFromLuma: 0.04,
  /** Low-frequency organic wobble in the depth field, in world units. */
  reliefNoise: 0.02,
} as const;

export const MOTION = {
  /** The idle "swim". Amplitude is in world units; keep it under a splat width. */
  swimAmplitude: 0.008,
  swimSpeed: 0.08,
  /** Shimmer modulates alpha and size, not position. */
  shimmerAmount: 0,
  shimmerSpeed: 0,
  /** A slow specular band travelling across the cloud. */
  glintSpeed: 0,
  glintWidth: 0,
  glintStrength: 0,
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
  /**
   * World z of the plane the pointer acts on. Sits just in front of the
   * foreground figure, where the geometry puts him — impulses spawned much
   * further back stir mostly empty air and the gesture goes unanswered.
   */
  planeDepth: 1.5,
} as const;

/**
 * Practical lights for the Hollywood office.
 *
 * The window and the hills sit behind everything, shining toward the lens through
 * the doorway. The desk lamp and ceiling fan are mid-room. A weak cool fill from
 * the foreground keeps the teal walls from clipping to black.
 */
export const LIGHTS = [
  {
    name: "window",
    position: [0.1, 0.55, -5.2] as [number, number, number],
    color: [1.0, 0.72, 0.48] as [number, number, number],
    intensity: 1.6,
    radius: 14,
    softness: 1.25,
    backlight: 0.28,
    phase: 4.8,
    flickerAmount: 0.02,
    flickerSpeed: 0.4,
  },
  {
    name: "desk lamp",
    position: [-1.4, -0.15, -2.0] as [number, number, number],
    color: [0.72, 0.88, 0.55] as [number, number, number],
    intensity: 1.1,
    radius: 6.5,
    softness: 1.6,
    backlight: 0.12,
    phase: 3.0,
    flickerAmount: 0.06,
    flickerSpeed: 1.8,
  },
  {
    name: "ceiling fan",
    position: [0.0, 1.15, -2.8] as [number, number, number],
    color: [1.0, 0.82, 0.62] as [number, number, number],
    intensity: 0.95,
    radius: 8.5,
    softness: 1.4,
    backlight: 0.18,
    phase: 3.6,
    flickerAmount: 0.04,
    flickerSpeed: 0.7,
  },
  {
    name: "doorway fill",
    position: [0.0, 0.0, 3.8] as [number, number, number],
    color: [0.55, 0.72, 0.78] as [number, number, number],
    intensity: 0.35,
    radius: 9,
    softness: 2.2,
    backlight: 0,
    phase: 2,
    flickerAmount: 0,
    flickerSpeed: 0,
  },
] as const;

export const RENDER = {
  /**
   * Kept low deliberately. The room should be lit by the practicals below, not
   * by a flat lift — ambient much above this puts an olive veil over the frame.
   */
  ambient: 0.55,
  exposure: 1.85,
  bloomStrength: 0.26,
  bloomRadius: 0.7,
  /**
   * Raised now the practicals shine toward the lens. Forward-scattered light puts
   * a lot more of the frame near the top of the range, and at the old threshold
   * the bloom took all of it.
   */
  bloomThreshold: 0.86,
  grain: 0.012,
  vignette: 0.24,
  aberration: 0.0012,
  /** Final grade. ACES tonemapping pulls the warmth out; this puts it back. */
  saturation: 1.12,
  contrast: 1.01,
  warmth: [1.04, 1.0, 0.94] as [number, number, number],
  brightness: 1.1,
  /** Signed. Positive lifts the shadows and pulls the highlights down. */
  shadows: 0.14,
  highlights: -0.04,
  /** Overall softness, as a fraction mixed toward a blurred copy. */
  blur: 0,
  blurRadius: 0.0025,
  /**
   * Halation: the bloom around a bright edge on film, where light scatters back
   * off the base and re-exposes the emulsion. Warm, wide, and weighted to the
   * highlights — which is exactly where the backlights live, so this is most of
   * what sells them as real sources rather than bright patches.
   */
  halation: 0.14,
  halationRadius: 0.012,
  halationThreshold: 0.55,
  halationTint: [1.0, 0.42, 0.22] as [number, number, number],
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
  { name: "hollywood sky", u: [0.36, 0.64], v: [0.08, 0.42], depth: 0.44, feather: 0.08 },
  { name: "office back wall", u: [0.3, 0.7], v: [0.12, 0.78], depth: 0.48, feather: 0.06 },
  { name: "desk and fan", u: [0.34, 0.66], v: [0.28, 0.68], depth: 0.5, feather: 0.1 },
  { name: "chair", u: [0.3, 0.48], v: [0.42, 0.74], depth: 0.52, feather: 0.12 },
  { name: "door frame", u: [0.26, 0.74], v: [0.0, 1.0], depth: 0.5, feather: 0.08 },
  { name: "office floor", u: [0.3, 0.7], v: [0.55, 0.95], depth: 0.54, feather: 0.12 },
  { name: "left palm", u: [0.0, 0.24], v: [0.1, 0.98], depth: 0.56, feather: 0.14 },
  { name: "right palm", u: [0.76, 1.0], v: [0.1, 0.98], depth: 0.56, feather: 0.14 },
  { name: "foreground walls", u: [0.0, 1.0], v: [0.0, 1.0], depth: 0.58, feather: 0.04 },
];

/** Base depth used where no region claims a pixel. */
export const DEPTH_BASE = 0.5;

/**
 * UI masks for plates that have chrome painted in. The Hollywood office plate is
 * clean — nothing to exclude.
 */
export const MASK_REGIONS: Array<{ name: string; u: [number, number]; v: [number, number] }> = [];
