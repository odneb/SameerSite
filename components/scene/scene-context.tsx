"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { TuningPanel } from "@/components/scene/tuning-panel";
import { useHydrated } from "@/lib/hydrated";
import { SplatField } from "@/lib/scene/splat-field";

type SceneApi = {
  /** Nudge the camera toward a point in normalized plate space. null releases. */
  focus: (u: number | null, v?: number, push?: number) => void;
  /** Disturb the field deliberately, e.g. on a click. */
  pulse: (strength?: number) => void;
  /**
   * Tear the field down and build it again. Needed for anything baked into the
   * splat buffers — the lens, the budget, the sampling curves.
   */
  rebuild: () => void;
  /** Stop the field tracking the pointer, e.g. while it is over a panel. */
  suspendPointer: (suspended: boolean) => void;
  ready: boolean;
};

const SceneContext = createContext<SceneApi>({
  focus: () => {},
  pulse: () => {},
  rebuild: () => {},
  suspendPointer: () => {},
  ready: false,
});

export function useScene() {
  return useContext(SceneContext);
}

function hasWebgl2() {
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2"));
  } catch {
    return false;
  }
}

type SceneStageProps = {
  plateUrl: string;
  depthUrl?: string | null;
  splatUrl?: string | null;
  roomUrl?: string | null;
  children: ReactNode;
};

type PlainImageStageProps = {
  plateUrl: string;
  children: ReactNode;
};

/** Static hero plate — no WebGL, no splats. */
export function PlainImageStage({ plateUrl, children }: PlainImageStageProps) {
  const api = useMemo<SceneApi>(
    () => ({
      focus: () => {},
      pulse: () => {},
      rebuild: () => {},
      suspendPointer: () => {},
      ready: true,
    }),
    [],
  );

  return (
    <SceneContext.Provider value={api}>
      <div
        className="bg-void pointer-events-none absolute inset-0 z-0 overflow-hidden"
        // Keep the plate out of the page's dark color-scheme so the browser
        // doesn't regrade it.
        style={{ colorScheme: "only light" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          aria-hidden
          alt=""
          src={plateUrl}
          className="absolute inset-0 h-full w-full origin-center object-cover object-center scale-x-[-1] max-md:scale-x-[-1.18] max-md:scale-y-[1.18] max-md:-translate-x-[6%]"
          style={{
            filter: "none",
            mixBlendMode: "normal",
            opacity: 1,
          }}
        />
        {/* Soft dim so type and nav stay readable over the plate. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-black/[0.18]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/20"
        />
      </div>
      {children}
    </SceneContext.Provider>
  );
}

export function SceneStage({
  plateUrl,
  depthUrl = null,
  splatUrl = null,
  roomUrl = null,
  children,
}: SceneStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<SplatField | null>(null);
  const hydrated = useHydrated();
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Without WebGL2 the canvas simply never fades in and the plate below it
    // stays visible, so there is nothing to handle here.
    if (!canvas || !hasWebgl2()) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const field = new SplatField(canvas, {
      plateUrl,
      depthUrl,
      splatUrl,
      roomUrl,
      reducedMotion,
      onReady: () => setReady(true),
    });
    fieldRef.current = field;

    let cancelled = false;
    field
      .init()
      .then(() => {
        if (cancelled) return;
        field.start();
      })
      .catch((error) => {
        console.error("splat field failed to start", error);
      });

    // One pointer sample per frame is plenty, and it keeps the raycast off the
    // input event's critical path.
    let pending: { x: number; y: number } | null = null;
    let scheduled = 0;
    const flush = () => {
      scheduled = 0;
      if (pending) field.setPointer(pending.x, pending.y);
      pending = null;
    };
    const onPointerMove = (event: PointerEvent) => {
      pending = { x: event.clientX, y: event.clientY };
      if (!scheduled) scheduled = requestAnimationFrame(flush);
    };
    const onPointerLeave = () => field.releasePointer();
    const onPointerDown = () => field.pulse(1);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);

    const observer = new ResizeObserver(() => field.resize());
    observer.observe(canvas);

    // Nothing to render against a hidden tab.
    const onVisibility = () => {
      if (document.hidden) field.stop();
      else field.start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (scheduled) cancelAnimationFrame(scheduled);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      field.dispose();
      fieldRef.current = null;
      setReady(false);
    };
  }, [plateUrl, depthUrl, splatUrl, roomUrl, generation]);

  const focus = useCallback((u: number | null, v = 0.5, push = 0) => {
    fieldRef.current?.setFocus(u, v, push);
  }, []);

  const pulse = useCallback((strength = 1) => {
    fieldRef.current?.pulse(strength);
  }, []);

  const rebuild = useCallback(() => {
    setGeneration((value) => value + 1);
  }, []);

  const suspendPointer = useCallback((suspended: boolean) => {
    fieldRef.current?.setPointerSuspended(suspended);
  }, []);

  const api = useMemo<SceneApi>(
    () => ({ focus, pulse, rebuild, suspendPointer, ready }),
    [focus, pulse, rebuild, suspendPointer, ready],
  );

  return (
    <SceneContext.Provider value={api}>
      <div className="bg-void pointer-events-none fixed inset-0 z-0">
        {/* The plate itself, holding the frame until the field is built — and
            standing in permanently if WebGL is unavailable. */}
        <div
          aria-hidden
          className="animate-plate-drift absolute inset-0 bg-cover bg-center transition-opacity duration-[1800ms]"
          style={{
            backgroundImage: `url(${plateUrl})`,
            opacity: ready ? 0 : 0.8,
          }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{
            opacity: ready ? 1 : 0,
            transition: "opacity 1800ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/45" />
      </div>
      {hydrated && !ready && <SceneLoader />}
      {children}
      <TuningPanel />
    </SceneContext.Provider>
  );
}

/** Held on a slug line while the field builds. */
function SceneLoader() {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center pb-[14vh]">
      <p className="animate-breathe text-ink-dim text-[0.66rem] tracking-[0.42em]">
        fade in.
      </p>
    </div>
  );
}
