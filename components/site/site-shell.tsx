"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useScene } from "@/components/scene/scene-context";
import { ScriptBody } from "@/components/site/script-body";
import type { Section, SiteContent } from "@/lib/content/schema";
import { useHydrated } from "@/lib/hydrated";

export function SiteShell({ content }: { content: SiteContent }) {
  const scene = useScene();
  const { sections } = content;

  const [activeId, setActiveId] = useState<string | null>(null);
  /** Kept alive through the closing transition so the panel doesn't blink. */
  const [rendered, setRendered] = useState<Section | null>(null);
  const hydrated = useHydrated();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = activeId ? (sections.find((s) => s.id === activeId) ?? null) : null;
  // Held back until hydration so the server's markup and the client's first
  // render agree on the animation state.
  const rise = hydrated ? "rise" : "";

  const open = useCallback(
    (id: string) => {
      const section = sections.find((s) => s.id === id);
      if (!section) return;
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setActiveId(id);
      setRendered(section);
      scene.pulse(0.85);
      scene.focus(section.focus.u, section.focus.v, -1.15);
    },
    [scene, sections],
  );

  const close = useCallback(() => {
    setActiveId(null);
    scene.focus(null);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setRendered(null), 700);
  }, [scene]);

  const step = useCallback(
    (delta: number) => {
      const currentIndex = activeId ? sections.findIndex((s) => s.id === activeId) : -1;
      const next = currentIndex + delta;
      if (next < 0) close();
      else if (next < sections.length) open(sections[next].id);
    },
    [activeId, close, open, sections],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
        return;
      }
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= sections.length) {
        open(sections[digit - 1].id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open, sections, step]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  /** Hover previews the section's framing; leaving restores the open one. */
  const previewFocus = (section: Section) => scene.focus(section.focus.u, section.focus.v);
  const restoreFocus = () => {
    if (active) scene.focus(active.focus.u, active.focus.v, -1.15);
    else scene.focus(null);
  };

  const isOpen = Boolean(activeId);

  return (
    <>
      {/* ───────────── Desktop chrome ───────────── */}
      <div className="pointer-events-none fixed z-30 hidden md:top-[8%] md:left-[14%] md:block">
        <header className={`plate-type pointer-events-auto ${rise}`}>
          <button
            type="button"
            onClick={close}
            className="text-ink hover:text-canvas block text-left text-[1.28rem] font-bold tracking-[0.4em] transition-colors duration-500"
          >
            {content.brand.name}
          </button>
          <p className="text-ember/90 mt-2 text-[0.95rem] tracking-[0.28em]">{content.brand.role}</p>
        </header>

        <div aria-hidden className="border-canvas/55 my-5 w-10 border-t" />

        <nav className="nav-on-painting">
          <ul className="space-y-2 text-left">
            {sections.map((section, index) => {
              const isActive = section.id === activeId;
              return (
                <li
                  key={section.id}
                  className={rise}
                  style={hydrated ? { animationDelay: `${240 + index * 90}ms` } : undefined}
                >
                  <button
                    type="button"
                    onClick={() => (isActive ? close() : open(section.id))}
                    onMouseEnter={() => previewFocus(section)}
                    onMouseLeave={restoreFocus}
                    onFocus={() => previewFocus(section)}
                    onBlur={restoreFocus}
                    aria-current={isActive ? "true" : undefined}
                    className="pointer-events-auto group inline-flex items-center justify-start gap-2.5 text-[0.88rem] tracking-[0.24em] transition-colors duration-500"
                  >
                    <span className="whitespace-nowrap">
                      <span className={isActive ? "text-canvas font-bold" : "text-canvas/75"}>
                        {section.number}
                      </span>{" "}
                      <span
                        className={
                          isActive ? "text-ink font-semibold" : "text-ink/75 group-hover:text-ink"
                        }
                      >
                        {section.label}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={`bg-canvas h-px transition-all duration-700 ease-out ${
                        isActive ? "w-5 opacity-90" : "w-0 opacity-0 group-hover:w-3.5 group-hover:opacity-70"
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div
        aria-hidden={isOpen}
        className="pointer-events-none fixed right-[7%] bottom-[9%] z-20 hidden md:block"
        style={{
          opacity: isOpen ? 0 : 1,
          transform: isOpen ? "translate3d(0, 14px, 0)" : "none",
          transition: "opacity 700ms ease, transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className={`plate-type ${rise}`} style={hydrated ? { animationDelay: "520ms" } : undefined}>
          {content.hero.quote
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, index) => (
              <p key={index} className="text-ink text-[1.08rem] leading-[1.7] tracking-[0.04em]">
                {line}
              </p>
            ))}
          {content.hero.quote.trim() && (
            <span aria-hidden className="bg-canvas/70 mt-4 block h-px w-5" />
          )}
          {content.hero.attribution && (
            <p
              className={`text-ember text-[0.74rem] tracking-[0.3em] ${
                content.hero.quote.trim() ? "mt-3" : ""
              }`}
            >
              {content.hero.attribution}
            </p>
          )}
        </div>
      </div>

      <section
        aria-hidden={!isOpen}
        className="fixed inset-y-0 right-0 z-20 hidden w-[52vw] max-w-[46rem] items-center md:flex"
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transform: isOpen ? "none" : "translate3d(2.5rem, 0, 0)",
          transition: "opacity 800ms ease, transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          aria-hidden
          className="from-void/94 via-void/72 absolute inset-0 bg-gradient-to-l to-transparent"
        />

        {rendered && (
          <article key={`desk-${rendered.id}`} className="relative w-full px-12 py-24">
            <div className="mb-8 flex items-start gap-8">
              {rendered.portrait && (
                <figure
                  className={`pointer-events-none absolute top-24 left-0 z-10 w-[17.5rem] -translate-x-[calc(100%+0.35rem)] overflow-hidden rounded-md shadow-[0_24px_60px_rgba(0,0,0,0.55)] ${rise}`}
                  style={hydrated ? { animationDelay: "160ms" } : undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={rendered.portrait}
                    alt=""
                    className="aspect-[3/4] h-auto w-full object-cover object-[62%_16%]"
                  />
                </figure>
              )}

              <div>
                <h1 className="text-[0.9rem] tracking-[0.36em]">
                  <span className="text-canvas font-bold">{rendered.number}</span>{" "}
                  <span className="text-ink font-semibold">{rendered.label}</span>
                </h1>
                <span aria-hidden className="bg-canvas/60 mt-3 block h-px w-8" />
              </div>
            </div>

            <div
              className={`scroll-quiet ${rise} max-h-[62vh] overflow-x-hidden overflow-y-auto pr-5`}
              style={hydrated ? { animationDelay: "120ms" } : undefined}
            >
              <ScriptBody text={rendered.script} />
            </div>
          </article>
        )}
      </section>

      <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-30 hidden px-12 pb-8 md:block">
        <div className="pointer-events-auto absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2.5">
          <button
            type="button"
            onClick={close}
            aria-label="title card"
            className={`h-[3px] rounded-full transition-all duration-700 ${
              isOpen ? "bg-ink-faint w-[3px]" : "bg-canvas w-4"
            }`}
          />
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => open(section.id)}
              onMouseEnter={() => previewFocus(section)}
              onMouseLeave={restoreFocus}
              aria-label={section.label}
              className={`h-[3px] rounded-full transition-all duration-700 ${
                section.id === activeId ? "bg-canvas w-4" : "bg-sage/70 hover:bg-ember w-[3px]"
              }`}
            />
          ))}
        </div>
      </footer>

      {/* ───────────── Mobile chrome ───────────── */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-30 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] md:hidden"
        style={{
          opacity: isOpen ? 0 : 1,
          transition: "opacity 500ms ease",
          visibility: isOpen ? "hidden" : "visible",
        }}
      >
        <header className={`plate-type pointer-events-auto ${rise}`}>
          <button
            type="button"
            onClick={close}
            className="text-ink block text-left text-[1.05rem] font-bold tracking-[0.32em]"
          >
            {content.brand.name}
          </button>
          <p className="text-ember/90 mt-1.5 text-[0.8rem] tracking-[0.24em]">{content.brand.role}</p>
        </header>
      </div>

      <div
        aria-hidden={isOpen}
        className="pointer-events-none fixed inset-x-0 z-20 px-5 md:hidden"
        style={{
          bottom: "calc(5.75rem + env(safe-area-inset-bottom))",
          opacity: isOpen ? 0 : 1,
          transform: isOpen ? "translate3d(0, 12px, 0)" : "none",
          transition: "opacity 500ms ease, transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className={`plate-type max-w-[28ch] ${rise}`} style={hydrated ? { animationDelay: "400ms" } : undefined}>
          {content.hero.quote
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, index) => (
              <p key={index} className="text-ink text-[0.95rem] leading-[1.65] tracking-[0.03em]">
                {line}
              </p>
            ))}
          {content.hero.quote.trim() && (
            <span aria-hidden className="bg-canvas/70 mt-3 block h-px w-5" />
          )}
          {content.hero.attribution && (
            <p
              className={`text-ember text-[0.68rem] tracking-[0.28em] ${
                content.hero.quote.trim() ? "mt-2.5" : ""
              }`}
            >
              {content.hero.attribution}
            </p>
          )}
        </div>
      </div>

      <nav
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden"
        style={{
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          opacity: isOpen ? 0 : 1,
          transition: "opacity 400ms ease",
          pointerEvents: isOpen ? "none" : "auto",
        }}
      >
        <div className="from-void/90 via-void/55 pointer-events-none absolute inset-0 bg-gradient-to-t to-transparent" />
        <ul className="relative flex items-stretch justify-between gap-1 px-3 pt-3">
          {sections.map((section, index) => {
            const isActive = section.id === activeId;
            return (
              <li key={section.id} className={`min-w-0 flex-1 ${rise}`} style={hydrated ? { animationDelay: `${280 + index * 80}ms` } : undefined}>
                <button
                  type="button"
                  onClick={() => open(section.id)}
                  aria-current={isActive ? "true" : undefined}
                  className="pointer-events-auto flex min-h-11 w-full flex-col items-center justify-center gap-0.5 px-1 py-2 tracking-[0.18em]"
                >
                  <span className={`text-[0.65rem] font-bold ${isActive ? "text-canvas" : "text-canvas/80"}`}>
                    {section.number}
                  </span>
                  <span className={`text-[0.72rem] font-semibold ${isActive ? "text-ink" : "text-ink/80"}`}>
                    {section.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile section sheet — full bleed, slides up. */}
      <section
        aria-hidden={!isOpen}
        className="fixed inset-0 z-50 flex flex-col md:hidden"
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transform: isOpen ? "none" : "translate3d(0, 2.5rem, 0)",
          transition: "opacity 500ms ease, transform 650ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div aria-hidden className="from-void via-void/92 absolute inset-0 bg-gradient-to-b to-void/80" />

        {rendered && (
          <article
            key={`mob-${rendered.id}`}
            className="relative flex min-h-0 flex-1 flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 pb-4">
              <div>
                <h1 className="text-[0.85rem] tracking-[0.3em]">
                  <span className="text-canvas font-bold">{rendered.number}</span>{" "}
                  <span className="text-ink font-semibold">{rendered.label}</span>
                </h1>
                <span aria-hidden className="bg-canvas/60 mt-2.5 block h-px w-7" />
              </div>
              <button
                type="button"
                onClick={close}
                className="text-ink-dim hover:text-ink -mr-1 min-h-11 min-w-11 px-2 text-[0.7rem] tracking-[0.22em]"
              >
                close
              </button>
            </header>

            <div className={`scroll-quiet ${rise} min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-6`}>
              {rendered.portrait && (
                <figure className="mb-6 w-[9.5rem] overflow-hidden rounded-md shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={rendered.portrait}
                    alt=""
                    className="aspect-[3/4] h-auto w-full object-cover object-[62%_16%]"
                  />
                </figure>
              )}
              <ScriptBody text={rendered.script} />
            </div>
          </article>
        )}
      </section>
    </>
  );
}
