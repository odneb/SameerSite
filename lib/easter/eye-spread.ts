/**
 * Easter egg: hold A+S+D, then arrows nudge the contact portrait's eyes.
 * ←/→ spread or pinch · ↑/↓ walk them up or down · hold both for diagonal.
 * Values persist for the browser (localStorage) after release.
 */

const STORAGE_KEY = "sameer-eye-pose";
/** Legacy key from the spread-only version. */
const LEGACY_KEY = "sameer-eye-spread";

/** Per-frame step while an arrow is held (rAF ~60Hz). */
const STEP_PER_FRAME = 0.012;

export type EyePose = {
  /** -1 = max pinch, +1 = max spread. */
  spread: number;
  /** -1 = max down, +1 = max up. */
  lift: number;
};

let pose: EyePose = { spread: 0, lift: 0 };
const listeners = new Set<() => void>();
let chordBound = false;

export function clampEyeAxis(value: number) {
  return Math.max(-1, Math.min(1, value));
}

export function getEyePose(): EyePose {
  return pose;
}

/** @deprecated use getEyePose().spread */
export function getEyeSpread() {
  return pose.spread;
}

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pose));
  } catch {
    /* private mode */
  }
}

export function setEyePose(next: Partial<EyePose>) {
  const spread = next.spread === undefined ? pose.spread : clampEyeAxis(next.spread);
  const lift = next.lift === undefined ? pose.lift : clampEyeAxis(next.lift);
  if (spread === pose.spread && lift === pose.lift) return;
  pose = { spread, lift };
  persist();
  emit();
}

export function nudgeEyeSpread(delta: number) {
  setEyePose({ spread: pose.spread + delta });
}

export function nudgeEyeLift(delta: number) {
  setEyePose({ lift: pose.lift + delta });
}

export function loadEyeSpread() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw != null) {
      const parsed = JSON.parse(raw) as Partial<EyePose>;
      pose = {
        spread: clampEyeAxis(Number(parsed.spread) || 0),
        lift: clampEyeAxis(Number(parsed.lift) || 0),
      };
      return;
    }

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy == null) return;
    const parsed = Number(legacy);
    if (Number.isFinite(parsed)) {
      pose = { spread: clampEyeAxis(parsed), lift: 0 };
      persist();
    }
  } catch {
    /* ignore */
  }
}

export function subscribeEyeSpread(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while A, S, and D are all held — arrows then drive the easter egg. */
export function isEyeChord(keys: Set<string>) {
  return keys.has("a") && keys.has("s") && keys.has("d");
}

/** Install once: A+S+D + arrows adjust eye pose (including diagonals). */
export function bindEyeChord() {
  if (chordBound || typeof window === "undefined") return;
  chordBound = true;
  loadEyeSpread();

  const heldLetters = new Set<string>();
  const heldArrows = new Set<string>();
  let raf = 0;

  const normalize = (key: string) => {
    if (key === "A" || key === "a") return "a";
    if (key === "S" || key === "s") return "s";
    if (key === "D" || key === "d") return "d";
    return key;
  };

  const stopLoop = () => {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const tick = () => {
    raf = 0;
    if (!isEyeChord(heldLetters) || heldArrows.size === 0) return;

    let dSpread = 0;
    let dLift = 0;
    if (heldArrows.has("ArrowLeft")) dSpread -= STEP_PER_FRAME;
    if (heldArrows.has("ArrowRight")) dSpread += STEP_PER_FRAME;
    if (heldArrows.has("ArrowUp")) dLift += STEP_PER_FRAME;
    if (heldArrows.has("ArrowDown")) dLift -= STEP_PER_FRAME;

    if (dSpread !== 0 || dLift !== 0) {
      setEyePose({
        spread: pose.spread + dSpread,
        lift: pose.lift + dLift,
      });
    }

    raf = requestAnimationFrame(tick);
  };

  const ensureLoop = () => {
    if (raf || !isEyeChord(heldLetters) || heldArrows.size === 0) return;
    raf = requestAnimationFrame(tick);
  };

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = normalize(event.key);
      if (key === "a" || key === "s" || key === "d") {
        heldLetters.add(key);
        ensureLoop();
        return;
      }

      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "ArrowUp" &&
        event.key !== "ArrowDown"
      ) {
        return;
      }

      if (!isEyeChord(heldLetters)) return;

      // Ignore OS key-repeat — the rAF loop already drives held directions.
      if (event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      heldArrows.add(event.key);
      ensureLoop();
    },
    true,
  );

  window.addEventListener(
    "keyup",
    (event) => {
      const key = normalize(event.key);
      if (key === "a" || key === "s" || key === "d") {
        heldLetters.delete(key);
        if (!isEyeChord(heldLetters)) {
          heldArrows.clear();
          stopLoop();
        }
        return;
      }

      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown"
      ) {
        heldArrows.delete(event.key);
        if (heldArrows.size === 0) stopLoop();
      }
    },
    true,
  );

  window.addEventListener("blur", () => {
    heldLetters.clear();
    heldArrows.clear();
    stopLoop();
  });
}
