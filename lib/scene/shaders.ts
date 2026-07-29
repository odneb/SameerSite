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
uniform vec4  uImpulseData[IMPULSE_COUNT]; // start time, strength, radius, unused
uniform float uTurbLife;
uniform float uTurbTau;
uniform float uTurbSwirl;

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
 * Pointer wake. Each impulse pushes radially and swirls tangentially, then
 * unwinds over several seconds with a slight overshoot so the cloud settles
 * like a disturbed liquid instead of snapping back.
 */
vec3 turbulence(vec3 p) {
  vec3 total = vec3(0.0);
  for (int i = 0; i < IMPULSE_COUNT; i++) {
    vec4 info = uImpulseData[i];
    float age = uTime - info.x;
    if (info.y <= 0.0 || age < 0.0 || age > uTurbLife) continue;

    vec3 delta = p - uImpulsePos[i];
    float dist = length(delta);
    if (dist > info.z) continue;

    float falloff = 1.0 - smoothstep(0.0, info.z, dist);
    falloff = pow(falloff, 1.6);

    // Quick attack, long exponential release.
    float envelope = exp(-age / uTurbTau) * (1.0 - exp(-age / 0.085));
    float wobble = sin(age * 4.1 - dist * 2.6);

    vec3 dir = dist > 1e-4 ? delta / dist : vec3(0.0, 1.0, 0.0);
    vec3 swirl = normalize(cross(dir, vec3(0.0, 0.0, 1.0)) + vec3(1e-5));
    vec3 push = mix(dir, swirl, uTurbSwirl);

    total += push * falloff * envelope * info.y * (0.72 + 0.28 * wobble);
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
  p += turbulence(position) * uMotionScale;

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
