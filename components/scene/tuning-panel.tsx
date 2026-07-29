"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useScene } from "@/components/scene/scene-context";
import { useHydrated } from "@/lib/hydrated";
import {
  REBUILD_PATHS,
  SECTIONS,
  exportChanges,
  exportTuning,
  getTuning,
  importTuning,
  readPath,
  resetSection,
  resetTuning,
  setPath,
  subscribeTuning,
  type Control,
  type Section,
  type Tuning,
} from "@/lib/scene/tuning";

/**
 * The tuning panel.
 *
 * Opens on `\`, sits in a column down one edge, and drives the live scene
 * directly — there is no apply step. The two copy buttons are the point of the
 * whole thing: a session of moving sliders ends as a block of JSON that can go
 * straight back into `config.ts`.
 *
 * Deliberately not part of the site. It is available while developing, and in a
 * deployed build only if the URL asks for it with `?tune`.
 */
export function TuningPanel() {
  const { rebuild, suspendPointer } = useScene();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"right" | "left">("right");
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [json, setJson] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTIONS.map((section) => [section.id, Boolean(section.open)])),
  );

  // Reading the URL is safe here only because `useHydrated` is false until the
  // client has taken over, so this never diverges from the server's markup.
  const allowed = useMemo(() => {
    if (!hydrated) return false;
    if (process.env.NODE_ENV === "development") return true;
    return new URLSearchParams(window.location.search).has("tune");
  }, [hydrated]);

  useEffect(() => {
    if (!allowed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "\\" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      // Do not swallow a backslash somebody is genuinely trying to type.
      if (
        target instanceof HTMLInputElement &&
        target.type !== "range" &&
        target.type !== "checkbox"
      ) {
        return;
      }
      if (target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed]);

  // The scene reacts to every pointer move, so tuning a slider would otherwise
  // stir the cloud the entire time the panel is being used.
  useEffect(() => {
    if (!open) suspendPointer(false);
    return () => suspendPointer(false);
  }, [open, suspendPointer]);

  const onChange = useCallback((path: string, value: number | boolean | string) => {
    setPath(path, value);
    if (REBUILD_PATHS.has(path)) setStale(true);
  }, []);

  /**
   * The clipboard API needs the document focused and a secure context, and it is
   * silently unavailable often enough that it cannot be the only route. Either
   * way the JSON lands in the box below, where it can be selected by hand.
   */
  const copy = useCallback(async (label: string, text: string) => {
    setJson(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${label} — copied`);
    } catch {
      setCopied(`${label} — clipboard blocked, copy from the box`);
    }
    window.setTimeout(() => setCopied(null), 2600);
  }, []);

  const apply = useCallback(() => {
    try {
      importTuning(json);
      setStale(true);
      setCopied("applied");
    } catch {
      setCopied("that is not valid json");
    }
    window.setTimeout(() => setCopied(null), 2600);
  }, [json]);

  const sections = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return SECTIONS;
    return SECTIONS.map((section) => ({
      ...section,
      controls: section.controls.filter(
        (control) =>
          control.label.toLowerCase().includes(needle) ||
          control.path.toLowerCase().includes(needle) ||
          section.title.includes(needle),
      ),
    })).filter((section) => section.controls.length > 0);
  }, [filter]);

  if (!allowed || !open) return null;

  return (
    <div
      onPointerEnter={() => suspendPointer(true)}
      onPointerLeave={() => suspendPointer(false)}
      className={[
        "fixed top-3 bottom-3 z-50 flex w-[19rem] flex-col",
        "rounded-lg border border-white/10 bg-black/75 backdrop-blur-md",
        "font-mono text-[10px] text-white/70 shadow-2xl",
        side === "right" ? "right-3" : "left-3",
      ].join(" ")}
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="tracking-[0.2em] text-white/90">tuning</span>
        <Fps />
        <div className="ml-auto flex items-center gap-1">
          <TinyButton
            onClick={() => setSide(side === "right" ? "left" : "right")}
            title="Move the panel to the other edge"
          >
            {side === "right" ? "←" : "→"}
          </TinyButton>
          <TinyButton onClick={() => setOpen(false)} title="Close (\\)">
            ✕
          </TinyButton>
        </div>
      </header>

      <div className="flex flex-col gap-1.5 border-b border-white/10 px-3 py-2">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="filter…"
          spellCheck={false}
          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-white/80 outline-none placeholder:text-white/25 focus:border-white/25"
        />
        <div className="flex gap-1">
          <TinyButton
            className="flex-1"
            onClick={() => copy("changes", exportChanges())}
            title="Only what you have moved. This is the one to paste."
          >
            copy changes
          </TinyButton>
          <TinyButton
            className="flex-1"
            onClick={() => copy("all", exportTuning())}
            title="The complete state, changed or not"
          >
            copy all
          </TinyButton>
        </div>
        <div className="flex gap-1">
          <TinyButton
            className="flex-1"
            onClick={() => {
              resetTuning();
              setStale(true);
            }}
          >
            reset all
          </TinyButton>
          <TinyButton
            className={[
              "flex-1",
              stale ? "border-amber-300/50 bg-amber-300/15 text-amber-100" : "",
            ].join(" ")}
            onClick={() => {
              rebuild();
              setStale(false);
            }}
            title="Rebuild the cloud. Needed after the lens or a build value moves."
          >
            {stale ? "rebuild ●" : "rebuild"}
          </TinyButton>
        </div>
        {copied && <p className="text-amber-100/70">{copied}</p>}
        <textarea
          value={json}
          onChange={(event) => setJson(event.target.value)}
          spellCheck={false}
          rows={json ? 7 : 2}
          placeholder="json appears here — or paste some in and apply"
          className="w-full resize-y rounded border border-white/10 bg-white/5 px-2 py-1 leading-snug text-white/70 outline-none placeholder:text-white/25 focus:border-white/25"
        />
        {json.trim().length > 0 && (
          <TinyButton onClick={apply} title="Apply the json in the box to the scene">
            apply pasted json
          </TinyButton>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        {sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            open={Boolean(openSections[section.id]) || filter.trim().length > 0}
            onToggle={() =>
              setOpenSections((state) => ({
                ...state,
                [section.id]: !state[section.id],
              }))
            }
            onReset={() => {
              resetSection((section.resetKey ?? section.id) as keyof Tuning);
              setStale(true);
            }}
            onChange={onChange}
          />
        ))}
        <p className="py-3 text-white/25">
          {"\\"} closes. splat lens and cloud build need a rebuild. 3d lens is live.
        </p>
      </div>
    </div>
  );
}

function SectionBlock({
  section,
  open,
  onToggle,
  onReset,
  onChange,
}: {
  section: Section;
  open: boolean;
  onToggle: () => void;
  onReset: () => void;
  onChange: (path: string, value: number | boolean | string) => void;
}) {
  return (
    <section className="border-b border-white/5 py-1.5 last:border-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-1.5 text-left text-white/80 hover:text-white"
        >
          <span className="text-white/30">{open ? "▾" : "▸"}</span>
          <span className="tracking-[0.16em]">{section.title}</span>
          <span className="text-white/20">{section.controls.length}</span>
        </button>
        {open && (
          <TinyButton onClick={onReset} title="Reset this section">
            reset
          </TinyButton>
        )}
      </div>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5 pl-1">
          {section.hint && <p className="text-white/25">{section.hint}</p>}
          {section.controls.map((control) => (
            <ControlRow key={control.path} control={control} onChange={onChange} />
          ))}
        </div>
      )}
    </section>
  );
}

function ControlRow({
  control,
  onChange,
}: {
  control: Control;
  onChange: (path: string, value: number | boolean | string) => void;
}) {
  const state = useSyncExternalStore(subscribeTuning, getTuning, getTuning);
  const value = readPath(state, control.path);

  if (control.kind === "toggle") {
    return (
      <label className="flex cursor-pointer items-center gap-2 py-0.5">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(control.path, event.target.checked)}
          className="h-3 w-3 accent-amber-200"
        />
        <span className="text-white/60">{control.label}</span>
      </label>
    );
  }

  if (control.kind === "select") {
    return (
      <label className="flex items-center gap-2 py-0.5">
        <span className="w-[5.5rem] shrink-0 truncate text-white/50">
          {control.label}
        </span>
        <select
          value={String(value)}
          onChange={(event) => onChange(control.path, event.target.value)}
          className="flex-1 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-white/80 outline-none focus:border-white/25"
        >
          {control.options.map((option) => (
            <option key={option} value={option} className="bg-neutral-900">
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const numeric = Number(value);
  // Enough places to represent the step, so a 0.0005 step is not shown as 0.
  const places = Math.max(0, Math.ceil(-Math.log10(control.step)));

  return (
    <div title={control.hint}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-white/50">
          {control.label}
          {control.rebuild && <span className="text-amber-200/60"> ↻</span>}
        </span>
        <input
          type="number"
          value={Number(numeric.toFixed(places))}
          step={control.step}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(control.path, next);
          }}
          className="w-[4.5rem] shrink-0 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-right text-white/80 outline-none focus:border-white/25"
        />
      </div>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={numeric}
        onChange={(event) => onChange(control.path, Number(event.target.value))}
        className="mt-0.5 h-1 w-full accent-amber-200"
      />
    </div>
  );
}

function TinyButton({
  children,
  onClick,
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "rounded border border-white/10 bg-white/5 px-1.5 py-0.5",
        "text-white/60 transition-colors hover:border-white/25 hover:text-white",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Frame rate, because splat count is the first thing anybody reaches for. */
function Fps() {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);

  useEffect(() => {
    let raf = 0;
    let since = performance.now();
    const tick = () => {
      frames.current++;
      const now = performance.now();
      if (now - since >= 500) {
        setFps(Math.round((frames.current * 1000) / (now - since)));
        frames.current = 0;
        since = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <span className="text-white/30">{fps} fps</span>;
}
