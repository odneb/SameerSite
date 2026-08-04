"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  BLOOM_BLEND_MODES,
  exportGradeJson,
  getGrade,
  GRAIN_BLEND_MODES,
  parseCubeToCurves,
  patchGrade,
  resetGrade,
  setGrade,
  subscribeGrade,
  type BlendMode,
} from "@/lib/grade/settings";

function useGrade() {
  return useSyncExternalStore(subscribeGrade, getGrade, getGrade);
}

export function GradePanel() {
  const grade = useGrade();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "\\" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement &&
        target.type !== "range" &&
        target.type !== "checkbox" &&
        target.type !== "file" &&
        target.type !== "button"
      ) {
        return;
      }
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onLut = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const { name, curves } = parseCubeToCurves(text);
      patchGrade({
        lutName: name || file.name,
        lutCurves: curves,
        lutStrength: grade.lutStrength > 0 ? grade.lutStrength : 0.65,
      });
    } catch {
      setError("could not read that .cube");
    }
  };

  const copyJson = async () => {
    const text = exportGradeJson(true);
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied — paste this for the default");
    } catch {
      setCopied("clipboard blocked — select from console");
      console.log(text);
    }
    window.setTimeout(() => setCopied(null), 2800);
  };

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 z-[70] bg-black/20 transition-opacity duration-300"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
        onClick={() => setOpen(false)}
      />

      <aside
        role="dialog"
        aria-label="film grade"
        className={[
          "fixed top-0 right-0 z-[80] flex h-dvh w-[min(22rem,92vw)] flex-col",
          "border-l border-white/10 bg-black/88 text-white/75 shadow-2xl backdrop-blur-xl",
          "font-mono text-[10px] tracking-[0.04em]",
          "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        style={{ pointerEvents: open ? "auto" : "none" }}
      >
        <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
          <span className="text-[11px] tracking-[0.22em] text-white/90">film grade</span>
          <span className="text-white/35">\\</span>
          <div className="ml-auto flex items-center gap-1">
            <TinyButton onClick={() => resetGrade()} title="Reset look">
              reset
            </TinyButton>
            <TinyButton onClick={() => setOpen(false)} title="Close (\\)">
              ✕
            </TinyButton>
          </div>
        </header>

        <div className="scroll-quiet flex-1 space-y-5 overflow-y-auto px-3 py-3">
          <Section title="grain">
            <Slider
              label="amount"
              value={grade.grain}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setGrade("grain", v)}
            />
            <Slider
              label="size (px)"
              value={grade.grainSize}
              min={0.35}
              max={12}
              step={0.05}
              onChange={(v) => setGrade("grainSize", v)}
            />
            <Select
              label="blend"
              value={grade.grainBlend}
              options={GRAIN_BLEND_MODES}
              onChange={(v) => setGrade("grainBlend", v as BlendMode)}
            />
            <Toggle
              label="animated"
              checked={grade.grainAnimated}
              onChange={(v) => setGrade("grainAnimated", v)}
            />
            <p className="text-white/30">
              size = particle size in px. always covers the full frame.
            </p>
          </Section>

          <Section title="optics">
            <Slider
              label="chromatic aberration"
              value={grade.chromaticAberration}
              min={0}
              max={8}
              step={0.05}
              onChange={(v) => setGrade("chromaticAberration", v)}
            />
            <Slider
              label="softness"
              value={grade.softness}
              min={0}
              max={2.5}
              step={0.02}
              onChange={(v) => setGrade("softness", v)}
            />
            <Slider
              label="bloom"
              value={grade.bloom}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setGrade("bloom", v)}
            />
            <Slider
              label="bloom radius"
              value={grade.bloomRadius}
              min={4}
              max={64}
              step={1}
              onChange={(v) => setGrade("bloomRadius", v)}
            />
            <Select
              label="bloom blend"
              value={grade.bloomBlend}
              options={BLOOM_BLEND_MODES}
              onChange={(v) => setGrade("bloomBlend", v as BlendMode)}
            />
            <Slider
              label="vignette"
              value={grade.vignette}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setGrade("vignette", v)}
            />
          </Section>

          <Section title="tone">
            <Slider
              label="luminance"
              value={grade.luminance}
              min={0.4}
              max={1.6}
              step={0.01}
              onChange={(v) => setGrade("luminance", v)}
            />
            <Slider
              label="contrast"
              value={grade.contrast}
              min={0.4}
              max={2}
              step={0.01}
              onChange={(v) => setGrade("contrast", v)}
            />
            <Slider
              label="tonal range"
              value={grade.tonalRange}
              min={0.25}
              max={1.75}
              step={0.01}
              onChange={(v) => setGrade("tonalRange", v)}
            />
            <Slider
              label="saturation"
              value={grade.saturation}
              min={0}
              max={2}
              step={0.01}
              onChange={(v) => setGrade("saturation", v)}
            />
            <Slider
              label="temperature"
              value={grade.temperature}
              min={-1}
              max={1}
              step={0.01}
              onChange={(v) => setGrade("temperature", v)}
            />
            <Slider
              label="fade"
              value={grade.fade}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setGrade("fade", v)}
            />
          </Section>

          <Section title="curves">
            <Slider
              label="shadows"
              value={grade.shadow}
              min={-1}
              max={1}
              step={0.01}
              onChange={(v) => setGrade("shadow", v)}
            />
            <Slider
              label="midtones"
              value={grade.midtone}
              min={-1}
              max={1}
              step={0.01}
              onChange={(v) => setGrade("midtone", v)}
            />
            <Slider
              label="highlights"
              value={grade.highlight}
              min={-1}
              max={1}
              step={0.01}
              onChange={(v) => setGrade("highlight", v)}
            />
          </Section>

          <Section title="lut">
            <Slider
              label="strength"
              value={grade.lutStrength}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setGrade("lutStrength", v)}
            />
            <div className="flex items-center gap-2 pt-0.5">
              <TinyButton onClick={() => fileRef.current?.click()}>load .cube</TinyButton>
              <span className="truncate text-white/40">{grade.lutName ?? "none"}</span>
              {grade.lutCurves && (
                <TinyButton
                  onClick={() =>
                    patchGrade({ lutCurves: null, lutName: null, lutStrength: 0 })
                  }
                >
                  clear
                </TinyButton>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".cube,text/plain"
              className="hidden"
              onChange={(event) => onLut(event.target.files?.[0] ?? null)}
            />
            {error && <p className="text-red-300/80">{error}</p>}
          </Section>
        </div>

        <footer className="space-y-2 border-t border-white/10 px-3 py-2.5">
          <button
            type="button"
            onClick={copyJson}
            className="w-full rounded border border-white/15 bg-white/8 px-2 py-1.5 text-[10px] tracking-[0.18em] text-white/85 transition-colors hover:border-white/30 hover:bg-white/12"
          >
            copy json
          </button>
          <p className="text-white/30">
            {copied ?? "press \\ to toggle · saves locally · paste json for default"}
          </p>
        </footer>
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="text-[10px] tracking-[0.28em] text-white/45">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0.5">
      <span className="text-white/55">{label}</span>
      <span className="tabular-nums text-white/35">{format(value)}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="col-span-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-white/80"
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-2">
      <span className="text-white/55">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-[9.5rem] rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/80 outline-none focus:border-white/25"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-black text-white">
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 py-0.5">
      <span className="text-white/55">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-white/80"
      />
    </label>
  );
}

function TinyButton({
  children,
  onClick,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/70 transition-colors hover:border-white/25 hover:text-white"
    >
      {children}
    </button>
  );
}

function format(value: number) {
  if (Math.abs(value) >= 10) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(3);
}
