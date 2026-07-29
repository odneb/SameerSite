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

import { SplatField } from "@/lib/scene/splat-field";

type SceneApi = {
  /** Nudge the camera toward a point in normalized plate space. null releases. */
  focus: (u: number | null, v?: number, push?: number) => void;
  /** Disturb the field deliberately, e.g. on a click. */
  pulse: (strength?: number) => void;
  ready: boolean;
};

const SceneContext = createContext<SceneApi>({
  focus: () => {},
  pulse: () => {},
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
  children: ReactNode;
};

export function SceneStage({
  plateUrl,
  depthUrl = null,
  splatUrl = null,
  children,
}: SceneStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<SplatField | null>(null);
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
  }, [plateUrl, depthUrl, splatUrl]);

  const focus = useCallback((u: number | null, v = 0.5, push = 0) => {
    fieldRef.current?.setFocus(u, v, push);
  }, []);

  const pulse = useCallback((strength = 1) => {
    fieldRef.current?.pulse(strength);
  }, []);

  const api = useMemo<SceneApi>(() => ({ focus, pulse, ready }), [focus, pulse, ready]);

  return (
    <SceneContext.Provider value={api}>
      <div className="bg-void pointer-events-none fixed inset-0 z-0">
        {/* The plate itself, holding the frame until the field is built — and
            standing in permanently if WebGL is unavailable. */}
        <div
          aria-hidden
          className="animate-plate-drift absolute inset-0 bg-cover bg-center opacity-70 blur-[2px]"
          style={{ backgroundImage: `url(${plateUrl})` }}
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
      {mounted && !ready && <SceneLoader />}
      {children}
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
