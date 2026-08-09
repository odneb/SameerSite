/**
 * Easter egg: hold A+S+D, then arrows nudge the contact portrait's eyes.
 * ←/→ spread or pinch · ↑/↓ walk them up or down · hold both for diagonal.
 * Session-only — resets on refresh and when leaving contact.
 */

/** Per-frame step while an arrow is held (rAF ~60Hz). */
const STEP_PER_FRAME = 0.012;

export type EyePose = {
  /** -1 = max pinch, +1 = max spread. */
  spread: number;
  /** -1 = max down, +1 = max up. */
  lift: number;
};

const ZERO: EyePose = { spread: 0, lift: 0 };

let pose: EyePose = ZERO;
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

export function setEyePose(next: Partial<EyePose>) {
  const spread = next.spread === undefined ? pose.spread : clampEyeAxis(next.spread);
  const lift = next.lift === undefined ? pose.lift : clampEyeAxis(next.lift);
  if (spread === pose.spread && lift === pose.lift) return;
  pose = spread === 0 && lift === 0 ? ZERO : { spread, lift };
  emit();
}

export function resetEyePose() {
  if (pose === ZERO || (pose.spread === 0 && pose.lift === 0)) {
    pose = ZERO;
    return;
  }
  pose = ZERO;
  emit();
}

export function nudgeEyeSpread(delta: number) {
  setEyePose({ spread: pose.spread + delta });
}

export function nudgeEyeLift(delta: number) {
  setEyePose({ lift: pose.lift + delta });
}

/** Clears any leftover keys from the old persisted version. */
export function loadEyeSpread() {
  try {
    localStorage.removeItem("sameer-eye-pose");
    localStorage.removeItem("sameer-eye-spread");
  } catch {
    /* ignore */
  }
  pose = ZERO;
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

  const typingInField = () => {
    const el = document.activeElement;
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      el.isContentEditable
    );
  };

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typingInField()) return;

      const key = normalize(event.key);
      if (key === "a" || key === "s" || key === "d") {
        // Stop browser typeahead / sequential focus nav from stealing these keys
        // (it was jumping the focus ring across acting / writing / contact).
        event.preventDefault();
        event.stopPropagation();
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && focused !== document.body) {
          focused.blur();
        }
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
