export type LutCurves = {
  r: number[];
  g: number[];
  b: number[];
};

export type BlendMode =
  | "overlay"
  | "soft-light"
  | "hard-light"
  | "multiply"
  | "screen"
  | "color-dodge"
  | "color-burn"
  | "difference"
  | "exclusion"
  | "luminosity"
  | "lighten"
  | "normal";

export const GRAIN_BLEND_MODES: BlendMode[] = [
  "overlay",
  "soft-light",
  "hard-light",
  "multiply",
  "screen",
  "color-dodge",
  "color-burn",
  "difference",
  "exclusion",
  "luminosity",
  "normal",
];

export const BLOOM_BLEND_MODES: BlendMode[] = [
  "soft-light",
  "screen",
  "overlay",
  "hard-light",
  "color-dodge",
  "lighten",
  "normal",
];

export type GradeSettings = {
  /** Opacity of the S35 film-grain layer (0–1). */
  grain: number;
  /**
   * Apparent grain particle size in CSS pixels.
   * ~0.8–1.6 reads as Super 35; larger = coarser stock.
   * Canvas always covers the full viewport.
   */
  grainSize: number;
  /**
   * Temporal rate as a multiple of 24fps.
   * 0 = still plate, 1 = 24fps film cadence, 2 = 48fps.
   */
  grainSpeed: number;
  grainBlend: BlendMode;
  /** Channel separation in CSS pixels. */
  chromaticAberration: number;
  tonalRange: number;
  contrast: number;
  luminance: number;
  saturation: number;
  temperature: number;
  shadow: number;
  midtone: number;
  highlight: number;
  fade: number;
  bloom: number;
  bloomRadius: number;
  bloomBlend: BlendMode;
  softness: number;
  vignette: number;
  lutStrength: number;
  lutName: string | null;
  lutCurves: LutCurves | null;
};

export const DEFAULT_GRADE: GradeSettings = {
  grain: 0.03,
  grainSize: 1,
  grainSpeed: 1,
  grainBlend: "overlay",
  chromaticAberration: 0.75,
  tonalRange: 0.97,
  contrast: 1.04,
  luminance: 0.89,
  saturation: 0.97,
  temperature: 0.12,
  shadow: -0.01,
  midtone: 0,
  highlight: 0.08,
  fade: 0,
  bloom: 0.46,
  bloomRadius: 19,
  bloomBlend: "soft-light",
  softness: 0.28,
  vignette: 0.04,
  lutStrength: 0,
  lutName: null,
  lutCurves: null,
};

const STORAGE_KEY = "sameer-film-grade-v4";

type Listener = () => void;

let settings: GradeSettings = { ...DEFAULT_GRADE };
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function getGrade(): GradeSettings {
  return settings;
}

export function subscribeGrade(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setGrade<K extends keyof GradeSettings>(key: K, value: GradeSettings[K]) {
  settings = { ...settings, [key]: value };
  persist();
  emit();
}

export function patchGrade(partial: Partial<GradeSettings>) {
  settings = { ...settings, ...partial };
  persist();
  emit();
}

export function resetGrade() {
  settings = { ...DEFAULT_GRADE };
  persist();
  emit();
}

/** Pasteable JSON for baking a look into DEFAULT_GRADE. */
export function exportGradeJson(includeLutCurves = true): string {
  const payload: Record<string, unknown> = { ...settings };
  if (!includeLutCurves) {
    delete payload.lutCurves;
    delete payload.lutName;
    delete payload.lutStrength;
  }
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function loadGradeFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem("sameer-film-grade-v2") ??
      window.localStorage.getItem("sameer-film-grade-v1");
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<GradeSettings> & {
      grainAnimated?: boolean;
    };
    // Migrate pre-v3 boolean animation flag into a 24fps speed multiplier.
    if (parsed.grainSpeed == null && typeof parsed.grainAnimated === "boolean") {
      parsed.grainSpeed = parsed.grainAnimated ? 1 : 0;
    }
    delete parsed.grainAnimated;
    settings = normalizeGrade({ ...DEFAULT_GRADE, ...parsed });
    emit();
  } catch {
    // ignore bad local drafts
  }
}

function normalizeGrade(value: GradeSettings): GradeSettings {
  return {
    ...value,
    grain: clamp(value.grain, 0, 1),
    grainSize: clamp(value.grainSize, 0.5, 6),
    grainSpeed: clamp(value.grainSpeed, 0, 3),
    grainBlend: (GRAIN_BLEND_MODES.includes(value.grainBlend) ? value.grainBlend : "soft-light") as BlendMode,
    bloomBlend: (BLOOM_BLEND_MODES.includes(value.bloomBlend) ? value.bloomBlend : "soft-light") as BlendMode,
    chromaticAberration: clamp(value.chromaticAberration, 0, 10),
    softness: clamp(value.softness, 0, 4),
  };
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const { lutCurves, ...rest } = settings;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(lutCurves && lutCurves.r.length > 64 ? rest : settings),
    );
  } catch {
    // quota / private mode
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Build a 0–1 response curve from shadow / mid / highlight lifts. */
export function curveTable(shadow: number, midtone: number, highlight: number, samples = 17): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const x = i / (samples - 1);
    const s = Math.pow(1 - x, 2);
    const h = Math.pow(x, 2);
    const m = 1 - s - h;
    // Stronger response so ±1 on the slider is clearly visible.
    let y = x + shadow * 0.55 * s + midtone * 0.4 * m + highlight * 0.55 * h;
    y = Math.min(1, Math.max(0, y));
    out.push(Number(y.toFixed(4)));
  }
  return out;
}

/**
 * Parse a 3D .cube LUT into per-channel gray-ramp curves (cheap DOM-friendly grade).
 */
export function parseCubeToCurves(text: string): { name: string; curves: LutCurves } {
  const lines = text.split(/\r?\n/);
  let size = 0;
  let title = "lut";
  const values: number[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("TITLE")) {
      const match = line.match(/TITLE\s+"?(.*?)"?$/i);
      if (match?.[1]) title = match[1];
      continue;
    }
    if (line.startsWith("LUT_3D_SIZE")) {
      size = Number(line.split(/\s+/)[1]);
      continue;
    }
    if (line.startsWith("LUT_1D_SIZE") || line.startsWith("DOMAIN_")) continue;
    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      values.push(parts[0], parts[1], parts[2]);
    }
  }

  if (size < 2 || values.length < size * size * size * 3) {
    throw new Error("unrecognized .cube");
  }

  const samples = Math.min(size, 33);
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];

  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const idx = Math.round(t * (size - 1));
    const base = (idx + idx * size + idx * size * size) * 3;
    r.push(clamp01(values[base] ?? t));
    g.push(clamp01(values[base + 1] ?? t));
    b.push(clamp01(values[base + 2] ?? t));
  }

  return { name: title, curves: { r, g, b } };
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function mixCurves(base: number[], lut: number[] | undefined, strength: number): number[] {
  if (!lut || strength <= 0) return base;
  const n = Math.max(base.length, lut.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const b = sampleTable(base, u);
    const l = sampleTable(lut, u);
    out.push(b * (1 - strength) + l * strength);
  }
  return out;
}

function sampleTable(table: number[], u: number) {
  if (table.length === 0) return u;
  if (table.length === 1) return table[0];
  const x = u * (table.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = table[Math.min(i, table.length - 1)];
  const b = table[Math.min(i + 1, table.length - 1)];
  return a + (b - a) * f;
}
