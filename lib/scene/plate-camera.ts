/**
 * The plate lens — one definition of distance and FOV shared by the backdrop,
 * the room mesh, and the splat cloud.
 *
 * The bake stores a view matrix; runtime places the mesh with
 * `translate(lens) * scale(lens / bakeDistance) * view` and parks the camera
 * on-axis at `(0, 0, lens)` looking at the origin. Any other camera orbit
 * breaks that contract.
 */

import * as THREE from "three";

/** Vertical-FOV cover distance for a plate-sized world volume. */
export function plateLensDistance(
  worldHeight: number,
  fovDeg: number,
  fitPadding = 1,
) {
  const halfFov = (fovDeg * Math.PI) / 360;
  return worldHeight / 2 / Math.tan(halfFov) / Math.max(fitPadding, 0.05);
}

/** On-axis camera locked to the plate. Pointer drift only — no orbit yaw/pitch. */
export function applyPlateCamera(
  camera: THREE.PerspectiveCamera,
  lensDistance: number,
  options: {
    maxYaw: number;
    maxPitch: number;
    ease: number;
    driftAmplitude: number;
    driftPeriod: number;
    freeze: boolean;
    offset: THREE.Vector2;
    focus: THREE.Vector3;
    interactive: boolean;
    elapsed: number;
    delta: number;
  },
) {
  const {
    maxYaw,
    maxPitch,
    ease,
    driftAmplitude,
    driftPeriod,
    freeze,
    offset,
    focus,
    interactive,
    elapsed,
    delta,
  } = options;

  const live = interactive && !freeze ? 1 : 0;
  const drift = (elapsed / Math.max(driftPeriod, 0.5)) * Math.PI * 2;

  const swayX =
    live * (offset.x * maxYaw + Math.sin(drift) * driftAmplitude) * lensDistance;
  const swayY =
    live *
    (offset.y * maxPitch + Math.cos(drift * 0.73) * driftAmplitude * 0.6) *
    lensDistance;

  camera.position.set(
    swayX + focus.x * lensDistance * 0.08,
    swayY + focus.y * lensDistance * 0.08,
    lensDistance + focus.z * live,
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(focus.x * lensDistance * 0.12, focus.y * lensDistance * 0.12, 0);
}
