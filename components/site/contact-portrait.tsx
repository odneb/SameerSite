"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  getEyePose,
  subscribeEyeSpread,
  type EyePose,
} from "@/lib/easter/eye-spread";

type Variant = "desktop" | "mobile";

type ContactPortraitProps = {
  src: string;
  variant: Variant;
  className?: string;
  imgClassName?: string;
};

/** Eye centers in source-image UV (calibrated to contact-portrait.jpg). */
const EYES = {
  left: { u: 0.505, v: 0.31 },
  right: { u: 0.62, v: 0.31 },
  /** Influence radius as a fraction of the shorter crop side. */
  radius: 0.09,
} as const;

const VARIANT = {
  desktop: { aspect: 3 / 4, posX: 0.62, posY: 0.16 },
  mobile: { aspect: 16 / 10, posX: 0.5, posY: 0.5 },
} as const;

const ZERO_POSE: EyePose = { spread: 0, lift: 0 };

function useEyePose() {
  return useSyncExternalStore(subscribeEyeSpread, getEyePose, () => ZERO_POSE);
}

function coverCrop(
  imgW: number,
  imgH: number,
  destW: number,
  destH: number,
  posX: number,
  posY: number,
) {
  const ir = imgW / imgH;
  const dr = destW / destH;
  let sw: number;
  let sh: number;
  if (ir > dr) {
    sh = imgH;
    sw = sh * dr;
  } else {
    sw = imgW;
    sh = sw / dr;
  }
  const sx = (imgW - sw) * posX;
  const sy = (imgH - sh) * posY;
  return { sx, sy, sw, sh };
}

function sourceUvToDest(
  u: number,
  v: number,
  imgW: number,
  imgH: number,
  destW: number,
  destH: number,
  posX: number,
  posY: number,
) {
  const { sx, sy, sw, sh } = coverCrop(imgW, imgH, destW, destH, posX, posY);
  return {
    x: ((u * imgW - sx) / sw) * destW,
    y: ((v * imgH - sy) / sh) * destH,
  };
}

function sampleBilinear(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  out: number[],
) {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const v0 = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
    const v1 = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
    out[c] = v0 * (1 - fy) + v1 * fy;
  }
}

/**
 * Local warp around each eye:
 * +spreadPx → apart · −spreadPx → pinch
 * +liftPx → up · −liftPx → down
 */
function warpEyes(
  src: ImageData,
  dst: ImageData,
  left: { x: number; y: number },
  right: { x: number; y: number },
  radius: number,
  spreadPx: number,
  liftPx: number,
) {
  const { width: w, height: h, data: sdata } = src;
  const ddata = dst.data;
  ddata.set(sdata);

  const r2 = Math.max(4, radius * radius);
  const inv = 1 / (2 * r2);
  const reach = radius * 2.6 + Math.abs(liftPx);
  const pixel = [0, 0, 0, 0];

  const minY = Math.max(0, Math.floor(Math.min(left.y, right.y) - reach));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(left.y, right.y) + reach));
  const minX = Math.max(0, Math.floor(Math.min(left.x, right.x) - reach));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(left.x, right.x) + reach));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dlx = x - left.x;
      const dly = y - left.y;
      const drx = x - right.x;
      const dry = y - right.y;
      const gL = Math.exp(-(dlx * dlx + dly * dly) * inv);
      const gR = Math.exp(-(drx * drx + dry * dry) * inv);
      const g = gL + gR;
      if (g < 0.02) continue;
      const sx = x + spreadPx * gL - spreadPx * gR;
      const sy = y + liftPx * Math.min(1, g);
      sampleBilinear(sdata, w, h, sx, sy, pixel);
      const i = (y * w + x) * 4;
      ddata[i] = pixel[0];
      ddata[i + 1] = pixel[1];
      ddata[i + 2] = pixel[2];
      ddata[i + 3] = 255;
    }
  }
}

function paintPose(
  canvas: HTMLCanvasElement,
  base: ImageData,
  eyes: { left: { x: number; y: number }; right: { x: number; y: number }; radius: number },
  pose: EyePose,
) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  if (Math.abs(pose.spread) < 0.001 && Math.abs(pose.lift) < 0.001) {
    ctx.putImageData(base, 0, 0);
    return;
  }

  const w = base.width;
  const h = base.height;
  const out = ctx.createImageData(w, h);
  const spreadPx = pose.spread * w * 0.032;
  const liftPx = pose.lift * h * 0.028;
  warpEyes(base, out, eyes.left, eyes.right, eyes.radius, spreadPx, liftPx);
  ctx.putImageData(out, 0, 0);
}

export function ContactPortrait({
  src,
  variant,
  className = "",
  imgClassName = "",
}: ContactPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<ImageData | null>(null);
  const eyesRef = useRef({
    left: { x: 0, y: 0 },
    right: { x: 0, y: 0 },
    radius: 0,
  });
  const pose = useEyePose();
  const layout = VARIANT[variant];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.src = src;

    const rebuild = () => {
      if (cancelled || !canvasRef.current || !img.naturalWidth) return;
      const el = canvasRef.current;
      const cssW = el.clientWidth;
      const cssH = el.clientHeight;
      if (cssW < 2 || cssH < 2) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }

      const ctx = el.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      const { posX, posY } = layout;
      const { sx, sy, sw, sh } = coverCrop(
        img.naturalWidth,
        img.naturalHeight,
        w,
        h,
        posX,
        posY,
      );
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      baseRef.current = ctx.getImageData(0, 0, w, h);

      eyesRef.current = {
        left: sourceUvToDest(
          EYES.left.u,
          EYES.left.v,
          img.naturalWidth,
          img.naturalHeight,
          w,
          h,
          posX,
          posY,
        ),
        right: sourceUvToDest(
          EYES.right.u,
          EYES.right.v,
          img.naturalWidth,
          img.naturalHeight,
          w,
          h,
          posX,
          posY,
        ),
        radius: EYES.radius * Math.min(w, h),
      };

      paintPose(el, baseRef.current, eyesRef.current, getEyePose());
    };

    const onReady = () => rebuild();
    if (img.complete && img.naturalWidth) onReady();
    else img.addEventListener("load", onReady);

    const ro = new ResizeObserver(() => rebuild());
    ro.observe(canvas);

    return () => {
      cancelled = true;
      img.removeEventListener("load", onReady);
      ro.disconnect();
    };
  }, [src, layout]);

  useEffect(() => {
    const el = canvasRef.current;
    const base = baseRef.current;
    if (!el || !base) return;
    paintPose(el, base, eyesRef.current, pose);
  }, [pose]);

  return (
    <figure className={className}>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={`block h-auto w-full ${imgClassName}`}
        style={{ aspectRatio: layout.aspect }}
      />
    </figure>
  );
}
