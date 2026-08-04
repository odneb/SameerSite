import { themeCssVars, type SiteTheme } from "@/lib/content/theme";

/** Injects editable theme colours/sizes onto .theme-v2. */
export function ThemeVars({ theme }: { theme: SiteTheme }) {
  const vars = themeCssVars(theme);
  const css = Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join("\n    ");

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.theme-v2 {
    ${css}
}
.theme-v2 .type-brand { font-size: calc(var(--type-brand) * var(--type-scale)); }
.theme-v2 .type-role { font-size: calc(var(--type-role) * var(--type-scale)); }
.theme-v2 .type-quote { font-size: calc(var(--type-quote) * var(--type-scale)); }
.theme-v2 .type-nav { font-size: calc(var(--type-nav) * var(--type-scale)); }
.theme-v2 .type-body { font-size: calc(var(--type-body) * var(--type-scale)); }
`,
      }}
    />
  );
}
