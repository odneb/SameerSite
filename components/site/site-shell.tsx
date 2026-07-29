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
  const [menuOpen, setMenuOpen] = useState(false);
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
      setMenuOpen(false);
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
        if (menuOpen) setMenuOpen(false);
        else close();
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
  }, [close, menuOpen, open, sections, step]);

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
      <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between px-7 py-7 md:px-12 md:py-10">
        <div className={`pointer-events-auto ${rise}`}>
          <button
            type="button"
            onClick={close}
            className="text-ink hover:text-ember block text-left text-[0.8rem] tracking-[0.44em] transition-colors duration-500"
          >
            {content.brand.name}
          </button>
          <p className="text-ink-dim mt-2.5 text-[0.58rem] tracking-[0.3em]">
            {content.brand.role}
          </p>
          <span aria-hidden className="bg-ink-faint mt-3.5 block h-px w-5" />
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-expanded={menuOpen}
          className={`pointer-events-auto ${rise} group text-ink-dim hover:text-ink flex items-center gap-3 text-[0.6rem] tracking-[0.34em] transition-colors duration-500`}
          style={hydrated ? { animationDelay: "120ms" } : undefined}
        >
          {menuOpen ? "close" : "menu"}
          <span aria-hidden className="flex w-6 flex-col gap-[4px]">
            <span className="bg-current block h-px w-full transition-transform duration-500 group-hover:translate-x-0.5" />
            <span className="bg-current block h-px w-full" />
            <span className="bg-current block h-px w-full transition-transform duration-500 group-hover:-translate-x-0.5" />
          </span>
        </button>
      </header>

      {/* Desktop index, held at the right edge like the mock. */}
      <nav className="pointer-events-none fixed top-1/2 right-7 z-30 hidden -translate-y-1/2 md:block md:right-12">
        <ul className="space-y-4 text-right">
          {sections.map((section, index) => {
            const isActive = section.id === activeId;
            return (
              <li key={section.id} className={rise} style={hydrated ? { animationDelay: `${240 + index * 90}ms` } : undefined}>
                <button
                  type="button"
                  onClick={() => (isActive ? close() : open(section.id))}
                  onMouseEnter={() => previewFocus(section)}
                  onMouseLeave={restoreFocus}
                  onFocus={() => previewFocus(section)}
                  onBlur={restoreFocus}
                  aria-current={isActive ? "true" : undefined}
                  className={`pointer-events-auto group flex items-center justify-end gap-3 text-[0.66rem] tracking-[0.3em] transition-colors duration-500 ${
                    isActive ? "text-ink" : "text-ink-faint hover:text-ink-dim"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`bg-ember h-px transition-all duration-700 ease-out ${
                      isActive ? "w-6 opacity-80" : "w-0 opacity-0 group-hover:w-4 group-hover:opacity-60"
                    }`}
                  />
                  <span className="whitespace-nowrap">
                    {section.number} . {section.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Standing quote. Steps aside once a section is open. */}
      <div
        aria-hidden={isOpen}
        className="pointer-events-none fixed bottom-[18vh] left-7 z-20 md:left-12"
        style={{
          opacity: isOpen ? 0 : 1,
          transform: isOpen ? "translate3d(0, 14px, 0)" : "none",
          transition: "opacity 700ms ease, transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className={rise} style={hydrated ? { animationDelay: "520ms" } : undefined}>
          {content.hero.quote.split("\n").map((line, index) => (
            <p key={index} className="text-ink text-[0.82rem] leading-[1.75] tracking-[0.06em]">
              {line}
            </p>
          ))}
          <span aria-hidden className="bg-ink-faint mt-4 block h-px w-5" />
          {content.hero.attribution && (
            <p className="text-ink-faint mt-3 text-[0.56rem] tracking-[0.34em]">
              {content.hero.attribution}
            </p>
          )}
        </div>
      </div>

      {/* The script page. */}
      <section
        aria-hidden={!isOpen}
        className="fixed inset-y-0 left-0 z-20 flex w-full max-w-[46rem] items-center md:w-[52vw]"
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transform: isOpen ? "none" : "translate3d(-2.5rem, 0, 0)",
          transition: "opacity 800ms ease, transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          aria-hidden
          className="from-void/95 via-void/80 absolute inset-0 bg-gradient-to-r to-transparent backdrop-blur-[3px]"
        />

        {rendered && (
          <article key={rendered.id} className="relative w-full px-7 py-24 md:px-12">
            <div className="mb-7 flex items-baseline justify-between gap-6">
              <h1 className="text-ink text-[0.7rem] tracking-[0.4em]">
                {rendered.number}. {rendered.label}
              </h1>
              <button
                type="button"
                onClick={close}
                className="text-ink-faint hover:text-ember shrink-0 text-[0.58rem] tracking-[0.3em] transition-colors duration-500"
              >
                esc
              </button>
            </div>

            <div
              className={`scroll-quiet ${rise} max-h-[62vh] overflow-y-auto pr-5`}
              style={hydrated ? { animationDelay: "120ms" } : undefined}
            >
              <ScriptBody text={rendered.script} />
            </div>

            <div className="mt-8 flex items-center gap-6 text-[0.58rem] tracking-[0.3em]">
              <button
                type="button"
                onClick={() => step(-1)}
                className="text-ink-faint hover:text-ink transition-colors duration-500"
              >
                prev
              </button>
              <span aria-hidden className="bg-hairline h-px w-8" />
              <button
                type="button"
                onClick={() => step(1)}
                className="text-ink-faint hover:text-ink transition-colors duration-500"
              >
                next
              </button>
            </div>
          </article>
        )}
      </section>

      {/* Full-screen index. The only nav on small screens. */}
      <div
        aria-hidden={!menuOpen}
        className="bg-void/92 fixed inset-0 z-40 flex items-center justify-center backdrop-blur-md"
        style={{
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? "auto" : "none",
          transition: "opacity 600ms ease",
        }}
      >
        <ul className="space-y-6 px-8">
          {sections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => open(section.id)}
                className="text-ink-dim hover:text-ink text-left text-[0.95rem] tracking-[0.3em] transition-colors duration-500"
              >
                <span className="text-ink-faint mr-4 text-[0.7rem]">{section.number}</span>
                {section.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-end justify-between px-7 pb-7 md:px-12 md:pb-8">
        <p className={`text-ink-faint ${rise} text-[0.54rem] tracking-[0.26em] whitespace-pre`}>
          {content.footer.copyright}
        </p>

        <div className="pointer-events-auto absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2.5">
          <button
            type="button"
            onClick={close}
            aria-label="title card"
            className={`h-[3px] rounded-full transition-all duration-700 ${
              isOpen ? "bg-ink-faint w-[3px]" : "bg-ember w-4"
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
                section.id === activeId ? "bg-ember w-4" : "bg-ink-faint hover:bg-ink-dim w-[3px]"
              }`}
            />
          ))}
        </div>
      </footer>
    </>
  );
}
