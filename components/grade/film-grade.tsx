"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { GradePanel } from "@/components/grade/grade-panel";
import {
  curveTable,
  getGrade,
  loadGradeFromStorage,
  mixCurves,
  subscribeGrade,
  type GradeSettings,
} from "@/lib/grade/settings";

type FilmGradeProps = {
  children: ReactNode;
};

function useGrade() {
  return useSyncExternalStore(subscribeGrade, getGrade, getGrade);
}

export function FilmGrade({ children }: FilmGradeProps) {
  const grade = useGrade();
  const reactId = useId().replace(/:/g, "");
  const filterId = `film-grade-${reactId}`;
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    loadGradeFromStorage();
    setBooted(true);
  }, []);

  const baseCurve = useMemo(
    () => curveTable(grade.shadow, grade.midtone, grade.highlight),
    [grade.shadow, grade.midtone, grade.highlight],
  );

  const curves = useMemo(() => {
    const strength = grade.lutStrength;
    return {
      r: mixCurves(baseCurve, grade.lutCurves?.r, strength),
      g: mixCurves(baseCurve, grade.lutCurves?.g, strength),
      b: mixCurves(baseCurve, grade.lutCurves?.b, strength),
    };
  }, [baseCurve, grade.lutCurves, grade.lutStrength]);

  const cssFilter = useMemo(() => buildCssFilter(grade, filterId), [grade, filterId]);
  const ca = Math.max(0, grade.chromaticAberration);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Graded world — plate, type, panels. */}
      <div
        className="grade-stage absolute inset-0 origin-center will-change-[filter]"
        style={{ filter: cssFilter }}
      >
        {children}
      </div>

      <svg aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden" focusable="false">
        <defs>
          <filter
            id={filterId}
            x="-5%"
            y="-5%"
            width="110%"
            height="110%"
            colorInterpolationFilters="sRGB"
          >
            <feOffset in="SourceGraphic" dx={-ca} dy="0" result="shiftR" />
            <feColorMatrix
              in="shiftR"
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="red"
            />
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="green"
            />
            <feOffset in="SourceGraphic" dx={ca} dy="0" result="shiftB" />
            <feColorMatrix
              in="shiftB"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
              result="blue"
            />
            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="ca" />

            <feComponentTransfer in="ca" result="curved">
              <feFuncR type="table" tableValues={curves.r.join(" ")} />
              <feFuncG type="table" tableValues={curves.g.join(" ")} />
              <feFuncB type="table" tableValues={curves.b.join(" ")} />
            </feComponentTransfer>

            {/* Film fade — lift the floor. */}
            <feColorMatrix
              in="curved"
              type="matrix"
              values={`1 0 0 0 ${grade.fade * 0.22}  0 1 0 0 ${grade.fade * 0.2}  0 0 1 0 ${grade.fade * 0.18}  0 0 0 1 0`}
              result="faded"
            />

            {/* Temperature — warm / cool. */}
            <feColorMatrix
              in="faded"
              type="matrix"
              values={`1 ${grade.temperature * 0.18} ${grade.temperature * 0.06} 0 0  0 1 0 0 0  ${-grade.temperature * 0.16} ${-grade.temperature * 0.04} 1 0 0  0 0 0 1 0`}
            />
          </filter>
        </defs>
      </svg>

      {/* Optical layers — always full-bleed, above graded content, below UI. */}
      <div className="pointer-events-none absolute inset-0 z-[60] overflow-hidden">
        {booted && <GrainOverlay grade={grade} />}
        {grade.bloom > 0.001 && (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backdropFilter: `blur(${grade.bloomRadius}px) brightness(${1 + grade.bloom * 0.55}) saturate(${1 + grade.bloom * 0.15})`,
              WebkitBackdropFilter: `blur(${grade.bloomRadius}px) brightness(${1 + grade.bloom * 0.55}) saturate(${1 + grade.bloom * 0.15})`,
              mixBlendMode: grade.bloomBlend,
              opacity: Math.min(1, 0.15 + grade.bloom * 0.85),
            }}
          />
        )}
        {grade.vignette > 0.001 && (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at center, transparent ${Math.max(18, 55 - grade.vignette * 28)}%, rgba(12,14,10,${0.35 + grade.vignette * 0.65}) 100%)`,
              opacity: Math.min(1, 0.35 + grade.vignette * 0.65),
            }}
          />
        )}
      </div>

      <GradePanel />
    </div>
  );
}

function buildCssFilter(grade: GradeSettings, filterId: string) {
  // tonalRange widens/narrows contrast around a usable midpoint
  const contrast = grade.contrast * (0.55 + grade.tonalRange * 0.45);
  const blur = grade.softness > 0.01 ? ` blur(${grade.softness}px)` : "";
  return `url(#${filterId}) contrast(${contrast}) brightness(${grade.luminance}) saturate(${grade.saturation})${blur}`;
}

/**
 * Super-35 film grain.
 *
 * Opacity / blend are CSS-only (never restart the loop). Size rebuilds the
 * buffer. Speed is read from a ref each frame so the slider stays live.
 * Softness comes from a light CSS blur — not a JS 3×3 (that froze the UI).
 */
function GrainOverlay({ grade }: { grade: GradeSettings }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef(grade.grainSpeed);
  const sizeRef = useRef(grade.grainSize);
  const opacityRef = useRef(grade.grain);
  speedRef.current = grade.grainSpeed;
  sizeRef.current = grade.grainSize;
  opacityRef.current = grade.grain;

  // One persistent loop. Size is read from a ref and rebuilds the buffer
  // when it changes — opacity/speed never tear the loop down.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
    if (!ctx) return;

    let raf = 0;
    let alive = true;
    let w = 0;
    let h = 0;
    let lastPaint = 0;
    let lastSize = -1;
    let image: ImageData | null = null;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const size = Math.min(6, Math.max(0.5, sizeRef.current));
      // Map size → sharp buffer resolution (no CSS blur).
      // 0.5 = finest (~960 long edge), 6 = coarse (~56).
      // Direct mapping so the slider never collapses under a perf cap.
      const t = (size - 0.5) / 5.5;
      const longEdge = Math.round(960 - t * (960 - 56));
      const aspect = rect.width / Math.max(1, rect.height);
      if (aspect >= 1) {
        w = longEdge;
        h = Math.max(8, Math.round(longEdge / aspect));
      } else {
        h = longEdge;
        w = Math.max(8, Math.round(longEdge * aspect));
      }

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        image = ctx.createImageData(w, h);
      } else if (!image || image.width !== w || image.height !== h) {
        image = ctx.createImageData(w, h);
      }
      lastSize = size;
    };

    const paint = () => {
      if (!alive || !image || w < 1 || h < 1) return;
      const data = image.data;

      // Sharp grain plate — mid-gray centered so blend modes respond.
      for (let i = 0; i < data.length; i += 4) {
        const n = (Math.random() * 255) | 0;
        data[i] = n;
        data[i + 1] = n;
        data[i + 2] = n;
        data[i + 3] = 255;
      }

      ctx.putImageData(image, 0, 0);
    };

    const tick = (time: number) => {
      if (!alive) return;

      // Live size changes rebuild the buffer without remounting.
      if (Math.abs(sizeRef.current - lastSize) > 0.001) {
        resize();
        paint();
        lastPaint = time;
      }

      if (opacityRef.current > 0.001) {
        const speed = speedRef.current;
        if (speed > 0.001) {
          const frameMs = 1000 / (24 * Math.max(0.05, speed));
          if (time - lastPaint >= frameMs) {
            paint();
            lastPaint = time;
          }
        }
      }
      raf = window.requestAnimationFrame(tick);
    };

    resize();
    paint();
    raf = window.requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      resize();
      paint();
    });
    ro.observe(wrap);

    return () => {
      alive = false;
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const visible = grade.grain > 0.001;

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden"
      style={{
        opacity: grade.grain,
        mixBlendMode: grade.grainBlend,
        visibility: visible ? "visible" : "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 h-full w-full"
        style={{
          // Sharp texel grain — no CSS blur. Fine size = small sharp particles.
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

function clampByte(n: number) {
  return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}
