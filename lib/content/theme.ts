/**
 * Editable site look — colours and type sizes.
 * Applied as CSS variables on .theme-v2.
 */

export type SiteTheme = {
  void: string;
  ink: string;
  inkDim: string;
  ember: string;
  canvas: string;
  sage: string;
  /** Multiplier on all type sizes (0.85–1.25). */
  scale: number;
  brandSize: number;
  roleSize: number;
  quoteSize: number;
  navSize: number;
  bodySize: number;
};

/** Matches the current theme-v2 plate look. */
export const defaultTheme: SiteTheme = {
  void: "#1c2319",
  ink: "#e8d9b8",
  inkDim: "#9a9374",
  ember: "#c9a35a",
  canvas: "#d63216",
  sage: "#6a765e",
  scale: 1,
  brandSize: 1.45,
  roleSize: 0.95,
  quoteSize: 0.9,
  navSize: 1.02,
  bodySize: 1.05,
};

const HEX = /^#[0-9a-f]{6}$/i;

function colour(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return HEX.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function size(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed * 100) / 100));
}

export function sanitizeTheme(input: unknown): SiteTheme {
  const source = (input ?? {}) as Partial<SiteTheme>;
  return {
    void: colour(source.void, defaultTheme.void),
    ink: colour(source.ink, defaultTheme.ink),
    inkDim: colour(source.inkDim, defaultTheme.inkDim),
    ember: colour(source.ember, defaultTheme.ember),
    canvas: colour(source.canvas, defaultTheme.canvas),
    sage: colour(source.sage, defaultTheme.sage),
    scale: size(source.scale, defaultTheme.scale, 0.85, 1.25),
    brandSize: size(source.brandSize, defaultTheme.brandSize, 0.9, 2.2),
    roleSize: size(source.roleSize, defaultTheme.roleSize, 0.7, 1.4),
    quoteSize: size(source.quoteSize, defaultTheme.quoteSize, 0.7, 1.4),
    navSize: size(source.navSize, defaultTheme.navSize, 0.7, 1.4),
    bodySize: size(source.bodySize, defaultTheme.bodySize, 0.8, 1.5),
  };
}

/** Inline CSS custom properties for the live site. */
export function themeCssVars(theme: SiteTheme): Record<string, string> {
  return {
    "--color-void": theme.void,
    "--color-ink": theme.ink,
    "--color-ink-dim": theme.inkDim,
    "--color-ember": theme.ember,
    "--color-canvas": theme.canvas,
    "--color-sage": theme.sage,
    "--color-hairline": `${theme.ink}24`,
    "--type-scale": String(theme.scale),
    "--type-brand": `${theme.brandSize}rem`,
    "--type-role": `${theme.roleSize}rem`,
    "--type-quote": `${theme.quoteSize}rem`,
    "--type-nav": `${theme.navSize}rem`,
    "--type-body": `${theme.bodySize}rem`,
  };
}
