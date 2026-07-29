/**
 * GLSL for the splat field.
 *
 * All of the life in the scene happens here: the idle swim, the shimmer, the
 * practical lights, and the pointer turbulence with its long elastic recovery.
 */

import { LIGHTS, TURBULENCE } from "./config";

export const LIGHT_COUNT = LIGHTS.length;
export const IMPULSE_COUNT = TURBULENCE.slots;

export const splatVertexShader = /* glsl */ `
precision highp float;

#define TAU 6.2831853
#define LIGHT_COUNT ${LIGHT_COUNT}
#define IMPULSE_COUNT ${IMPULSE_COUNT}

uniform float uTime;
uniform float uFocal;
uniform float uSizeScale;
uniform float uReveal;
uniform float uMotionScale;
uniform float uAmbient;
uniform float uDepthHaze;
uniform vec3  uSwim;      // amplitude, speed, depth gain
uniform vec4  uShimmer;   // amount, speed, glint speed, glint strength
uniform float uGlintWidth;
uniform vec3  uLightPos[LIGHT_COUNT];
uniform vec3  uLightColor[LIGHT_COUNT];
uniform vec4  uLightParams[LIGHT_COUNT];  // intensity, radius, flicker amount, flicker speed
uniform vec3  uImpulsePos[IMPULSE_COUNT];
uniform vec4  uImpulseData[IMPULSE_COUNT]; // start time, strength, radius, stroke angle
uniform float uTurbLife;
uniform float uTurbTau;
uniform float uTurbAttack;
uniform float uTurbRoll;
uniform float uTurbChaos;
uniform float uTurbScale;
uniform float uTurbLimit;

attribute vec3  aColor;
attribute vec2  aScale;
attribute float aRotation;
attribute vec3  aSeed;
attribute float aLuma;

varying vec3  vColor;
varying float vAlpha;
varying float vRotation;
varying float vAspect;

/**
 * Idle drift. Three offset sine octaves per axis read as fluid rather than
 * periodic, and every splat carries its own phase so the field never pulses
 * in unison.
 */
vec3 swim(vec3 p, float t, vec3 seed) {
  vec3 phase = seed * TAU;
  vec3 d;
  d.x = sin(p.y * 1.7 + t * 0.94 + phase.x) + 0.5 * sin(p.z * 2.3 - t * 0.71 + phase.y);
  d.y = sin(p.z * 1.9 + t * 0.83 + phase.y) + 0.5 * sin(p.x * 2.1 + t * 0.59 + phase.z);
  d.z = sin(p.x * 1.5 + t * 0.74 + phase.z) + 0.5 * sin(p.y * 2.7 - t * 0.65 + phase.x);
  d.z *= uSwim.z;
  return d * 0.6667;
}

/**
 * Arnold–Beltrami–Childress flow.
 *
 * Each component depends only on the two axes it does not point along, so the
 * divergence is exactly zero — the field can stretch and fold the cloud without
 * ever compressing it or opening a hole. It is also chaotic, which is the part
 * that matters here: this is what makes the motion read as turbulence rather
 * than as a pattern being applied to the splats.
 */
vec3 abcFlow(vec3 p) {
  return vec3(
    sin(p.z) + cos(p.y),
    sin(p.x) + cos(p.z),
    sin(p.y) + cos(p.x)
  );
}

/** Two octaves of it, drifting, so there is structure at more than one scale. */
vec3 turbField(vec3 p, float t) {
  vec3 q = p * uTurbScale;
  vec3 flow = abcFlow(q + vec3(t * 0.35, -t * 0.27, t * 0.19));
  flow += 0.45 * abcFlow(q * 2.7 - vec3(t * 0.41, t * 0.33, -t * 0.25));
  return flow * 0.69;
}

/**
 * Pointer wake.
 *
 * Nothing in here points away from the cursor. An impulse remembers the
 * direction the pointer was travelling and contributes three things, all of
 * which preserve volume: a drag along that stroke, a roll about it, and a share
 * of the ambient turbulent field above. The first two tie the motion to the
 * gesture that caused it; the third is what keeps it from looking mechanical.
 *
 * The field is sampled on a clock shared by every impulse, so overlapping
 * disturbances stir one body of air instead of each spinning their own.
 *
 * Slow attack, long exponential release: the disturbance is taken in like
 * something viscous and unwinds over several seconds.
 */
vec3 turbulence(vec3 p, vec3 seed) {
  vec3 total = vec3(0.0);
  vec3 chaos = turbField(p, uTime);

  for (int i = 0; i < IMPULSE_COUNT; i++) {
    vec4 info = uImpulseData[i];
    float age = uTime - info.x;
    if (info.y <= 0.0 || age < 0.0 || age > uTurbLife) continue;

    vec3 delta = p - uImpulsePos[i];
    float dist = length(delta);
    if (dist > info.z) continue;

    // Wide, soft bell. Squared rather than sharpened so there is no edge for
    // the eye to catch as the impulse decays.
    float falloff = 1.0 - smoothstep(0.0, info.z, dist);
    falloff *= falloff;

    float envelope = exp(-age / uTurbTau) * (1.0 - exp(-age / uTurbAttack));

    vec3 stroke = vec3(cos(info.w), sin(info.w), 0.0);
    vec3 radial = dist > 1e-4 ? delta / dist : vec3(0.0, 0.0, 1.0);
    vec3 roll = cross(stroke, radial);

    vec3 gesture = mix(stroke, roll, uTurbRoll);
    // Per-splat phase on the crossfade, so neighbours lean differently between
    // following the stroke and following the field. Uniform blending across the
    // whole impulse is what makes this kind of thing look like a filter.
    float lean = uTurbChaos * (0.72 + 0.28 * sin(seed.x * TAU + age * 0.9));
    total += mix(gesture, chaos, lean) * falloff * envelope * info.y;
  }

  // Overlapping impulses must not be free to add without bound. A cursor held
  // still keeps spawning into the same place, and the whole ring buffer landing
  // on one point is enough to throw the cloud clean out of frame. This bends the
  // sum toward an asymptote instead of capping it, so there is no threshold to
  // see — a hard clamp would show up as the wake flattening off mid-gesture.
  float magnitude = length(total);
  if (magnitude > 1e-5) {
    total *= uTurbLimit / (uTurbLimit + magnitude);
  }
  return total;
}

/** Practical lights, attenuated in world space. No normals, all falloff. */
vec3 shade(vec3 p, vec3 base, float luma) {
  vec3 lit = base * uAmbient;
  for (int i = 0; i < LIGHT_COUNT; i++) {
    vec4 params = uLightParams[i];
    float dist = length(p - uLightPos[i]);
    float atten = 1.0 - smoothstep(0.0, params.y, dist);
    atten *= atten;
    float flicker = 1.0 + params.z * sin(uTime * params.w + float(i) * 2.17)
                        + params.z * 0.4 * sin(uTime * params.w * 2.7 + float(i));
    lit += base * uLightColor[i] * params.x * atten * flicker * (0.35 + 0.65 * luma);
  }
  return lit;
}

void main() {
  vec3 p = position;
  float t = uTime * uSwim.y;

  p += swim(position, t, aSeed) * uSwim.x * uMotionScale;
  p += turbulence(position, aSeed) * uMotionScale;

  // Intro: splats condense out of the dark, staggered by seed.
  float reveal = clamp(uReveal * 1.75 - aSeed.z * 0.75, 0.0, 1.0);
  reveal = reveal * reveal * (3.0 - 2.0 * reveal);
  vec3 scatter = normalize(vec3(aSeed.x - 0.5, aSeed.y - 0.5, aSeed.z - 0.5) + vec3(1e-4));
  p += scatter * (1.0 - reveal) * 1.35;

  vec3 lit = shade(p, aColor, aLuma);

  // Shimmer modulates emission, never position, so detail stays legible.
  float shimmer = 1.0 - uShimmer.x
                + uShimmer.x * (0.5 + 0.5 * sin(uTime * uShimmer.y + aSeed.y * TAU + p.y * 2.1));

  // A slow specular band travelling across the volume.
  float band = sin((p.x * 0.34 + p.y * 0.21 + p.z * 0.12) - uTime * uShimmer.z);
  float glint = smoothstep(1.0 - uGlintWidth, 1.0, band) * uShimmer.w * aLuma;
  lit += lit * glint;

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);

  // Atmospheric thinning with distance gives the volume air.
  float haze = 1.0 - clamp((-mvPosition.z - 8.0) / 12.0, 0.0, 1.0) * uDepthHaze;

  vColor = lit;
  vAlpha = clamp(0.9 * shimmer * reveal * haze, 0.0, 1.0);
  vRotation = aRotation;
  vAspect = min(aScale.x, aScale.y) / max(aScale.x, aScale.y);

  float radius = max(aScale.x, aScale.y) * (1.0 + glint * 0.35);
  float size = uSizeScale * radius * uFocal / max(-mvPosition.z, 0.001);
  gl_PointSize = clamp(size, 0.85, 96.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const splatFragmentShader = /* glsl */ `
precision highp float;

uniform float uFalloff;
uniform float uGlow;

varying vec3  vColor;
varying float vAlpha;
varying float vRotation;
varying float vAspect;

void main() {
  // Shape an oriented ellipse inside the square sprite.
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float s = sin(vRotation);
  float co = cos(vRotation);
  vec2 r = vec2(c.x * co - c.y * s, c.x * s + c.y * co);
  r.y /= max(vAspect, 0.08);

  float d2 = dot(r, r);
  if (d2 > 1.0) discard;

  float gaussian = exp(-uFalloff * d2);
  float alpha = gaussian * vAlpha;
  if (alpha < 0.0035) discard;

  // Premultiplied output, with a touch of extra emission in the core so dense
  // regions bloom instead of flattening out.
  gl_FragColor = vec4(vColor * alpha * (1.0 + uGlow * gaussian), alpha);
}
`;

/**
 * The room mesh sitting behind the cloud.
 *
 * This is the same lighting rig the splats use — same practicals, same falloff,
 * same flicker — so the two read as one space rather than a render with a photo
 * pasted over it. The differences are all deliberate: the mesh has real normals,
 * so it takes a wrapped diffuse term the splats can't; and it is graded far down,
 * because its job is to supply mass, occlusion and parallax, not brightness. The
 * image belongs to the splats.
 */
export const roomVertexShader = /* glsl */ `
precision highp float;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv;
varying float vViewDepth;

void main() {
  vUv = uv;

  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  // Placement is a rotation and a uniform scale, so the model matrix's upper
  // 3x3 carries normals correctly once renormalised.
  vWorldNormal = normalize(mat3(modelMatrix) * normal);

  vec4 mvPosition = viewMatrix * world;
  vViewDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const roomFragmentShader = /* glsl */ `
precision highp float;

#define LIGHT_COUNT ${LIGHT_COUNT}

uniform sampler2D uMap;
uniform float uTime;
uniform float uReveal;
uniform float uAmbient;
uniform float uBrightness;
uniform float uSaturation;
uniform float uHighlight;
uniform vec3  uTint;
uniform float uGrainAmount;
uniform float uGrainScale;
uniform float uRimStrength;
uniform float uRimPower;
uniform float uLightWrap;
uniform float uBreathAmount;
uniform float uBreathSpeed;
uniform float uDepthHaze;
uniform vec3  uLightPos[LIGHT_COUNT];
uniform vec3  uLightColor[LIGHT_COUNT];
uniform vec4  uLightParams[LIGHT_COUNT];

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv;
varying float vViewDepth;

vec3 toLinear(vec3 c) {
  return pow(max(c, vec3(0.0)), vec3(2.2));
}

void main() {
  vec3 base = toLinear(texture2D(uMap, vUv).rgb);

  vec3 view = normalize(cameraPosition - vWorldPos);
  // The capture is double sided and its winding is not reliable, so flip any
  // normal that faces away from us rather than letting whole panels go black.
  vec3 normal = normalize(vWorldNormal);
  if (dot(normal, view) < 0.0) normal = -normal;

  vec3 lit = base * uAmbient;
  vec3 rim = vec3(0.0);

  for (int i = 0; i < LIGHT_COUNT; i++) {
    vec4 params = uLightParams[i];
    vec3 toLight = uLightPos[i] - vWorldPos;
    float dist = length(toLight);
    vec3 l = toLight / max(dist, 1e-4);

    float atten = 1.0 - smoothstep(0.0, params.y, dist);
    atten *= atten;

    float flicker = 1.0 + params.z * sin(uTime * params.w + float(i) * 2.17)
                        + params.z * 0.4 * sin(uTime * params.w * 2.7 + float(i));

    // Wrapped diffuse. A hard N.L on a mesh this dim just crushes half of it to
    // nothing; wrapping keeps the shadowed side reading as form.
    float ndl = dot(normal, l);
    ndl = max(ndl + uLightWrap, 0.0) / (1.0 + uLightWrap);

    vec3 contribution = uLightColor[i] * params.x * atten * flicker;
    lit += base * contribution * ndl;
    rim += contribution;
  }

  // Grazing angles pick up the practicals directly, so the silhouette glows
  // where it meets the splats instead of cutting a hard edge against them.
  float fresnel = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), uRimPower);
  lit += rim * fresnel * uRimStrength * (0.35 + 0.65 * dot(base, vec3(0.333)));

  float grey = dot(lit, vec3(0.2126, 0.7152, 0.0722));
  lit = mix(vec3(grey), lit, uSaturation);

  // Hard highlight rolloff. The bedding is the brightest thing in the capture by
  // a distance, and at full range it walks straight over the cloud; compressing
  // here keeps its shape while surrendering the top of the tonal range to the
  // splats, which is where the image is supposed to live.
  lit = lit / (1.0 + lit * uHighlight);

  // Tinted after the rolloff, not before. Compressing per channel pulls bright
  // values toward each other, so a warmth applied earlier is squeezed back out
  // of exactly the surfaces that need it most — the near-neutral bedding.
  lit *= uTint;

  // Break the surface up so it belongs to the same medium as the cloud. Without
  // this the mesh is the one perfectly smooth thing in a frame made of grain,
  // and the eye goes straight to it.
  vec3 g = vWorldPos * uGrainScale;
  float grain = sin(g.x) * sin(g.y * 1.31 + 1.7) * sin(g.z * 0.87 + 3.1);
  lit *= 1.0 - uGrainAmount * (0.5 - 0.5 * grain);

  // Very low frequency, so it is felt rather than seen.
  float breath = 1.0 + uBreathAmount * sin(uTime * uBreathSpeed + vWorldPos.y * 0.3);
  lit *= uBrightness * breath;

  float haze = 1.0 - clamp((vViewDepth - 8.0) / 12.0, 0.0, 1.0) * uDepthHaze;
  lit *= haze;

  // Rises out of the dark on the same beat as the cloud.
  gl_FragColor = vec4(lit * uReveal, 1.0);
}
`;

/** Final grade: warmth, filmic vignette, grain, and a whisper of aberration. */
export const gradeShader = {
  uniforms: {
    tDiffuse: { value: null as unknown },
    uTime: { value: 0 },
    uGrain: { value: 0.055 },
    uVignette: { value: 1.05 },
    uAberration: { value: 0.0022 },
    uSaturation: { value: 1.14 },
    uContrast: { value: 1.07 },
    uWarmth: { value: null as unknown },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec3  uWarmth;

    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 centred = vUv - 0.5;
      float radius = length(centred);

      // Aberration scales with distance from centre, like real glass.
      vec2 offset = centred * uAberration * radius;
      vec3 color;
      color.r = texture2D(tDiffuse, vUv + offset).r;
      color.g = texture2D(tDiffuse, vUv).g;
      color.b = texture2D(tDiffuse, vUv - offset).b;

      // Warmth and saturation, then a gentle S-curve pivoting on mid grey.
      color *= uWarmth;
      float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(grey), color, uSaturation);
      color = clamp((color - 0.5) * uContrast + 0.5, 0.0, 1.0);

      float vignette = 1.0 - smoothstep(0.48, 0.95, radius) * uVignette;
      color *= clamp(vignette, 0.0, 1.0);

      float grain = hash(vUv * vec2(1024.0, 640.0) + fract(uTime) * 91.7) - 0.5;
      color += grain * uGrain;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};
