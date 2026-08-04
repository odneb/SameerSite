import { Fragment, type ReactNode } from "react";

import { parseScript } from "@/lib/content/schema";

const EMAIL_OR_URL = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/[^\s]+)/gi;
const URL_ONLY = /^https?:\/\/\S+$/i;
const EMAIL_ONLY = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

const linkClass =
  "text-ember decoration-ember/45 hover:text-canvas hover:decoration-canvas/50 font-semibold underline underline-offset-4 transition-colors duration-300";

function externalLink(href: string, children: ReactNode, key?: string | number) {
  const isEmail = href.startsWith("mailto:") || EMAIL_ONLY.test(href);
  const url = isEmail && !href.startsWith("mailto:") ? `mailto:${href}` : href;
  return (
    <a
      key={key}
      href={url}
      target={isEmail ? undefined : "_blank"}
      rel={isEmail ? undefined : "noreferrer"}
      className={linkClass}
    >
      {children}
    </a>
  );
}

/** Turn addresses and links into something you can actually click. */
function linkify(text: string) {
  const parts = text.split(EMAIL_OR_URL);
  return parts.map((part, index) => {
    if (!part) return null;
    const isEmail = EMAIL_ONLY.test(part);
    const isUrl = /^https?:\/\//i.test(part);
    if (!isEmail && !isUrl) return <Fragment key={index}>{part}</Fragment>;
    return externalLink(part, part, index);
  });
}

/**
 * Renders the screenplay syntax with real script geometry: slug lines flush
 * left, character cues indented, dialogue in a narrow column.
 */
export function ScriptBody({ text }: { text: string }) {
  const blocks = parseScript(text);

  return (
    <div className="max-w-full overflow-x-hidden text-[1.05rem] leading-[1.9] tracking-[0.015em] break-words md:text-[1.1rem]">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "scene":
            return (
              <p
                key={index}
                className="border-canvas/35 text-canvas mt-1 mb-5 border-b pb-3 text-[0.78rem] font-semibold tracking-[0.3em]"
              >
                {block.text}
              </p>
            );

          case "action": {
            // Closing asides (e.g. writing availability) sit apart from body copy.
            const isAside = /pages available on request/i.test(block.text);
            if (isAside) {
              return (
                <div key={index} className="mt-2 mb-3.5 max-w-[48ch]">
                  <span aria-hidden className="bg-canvas/70 mb-4 block h-px w-8" />
                  <p className="text-ember/85 font-semibold">{linkify(block.text)}</p>
                </div>
              );
            }
            return (
              <p key={index} className="text-ink mb-3.5 max-w-[48ch] font-semibold">
                {linkify(block.text)}
              </p>
            );
          }

          case "character":
            return (
              <p
                key={index}
                className="text-ember mt-5 mb-1 ml-[24%] text-[0.82rem] font-semibold tracking-[0.28em]"
              >
                {block.text}
              </p>
            );

          case "parenthetical":
            return (
              <p key={index} className="text-sage mb-1 ml-[19%] text-[0.9rem]">
                ({block.text})
              </p>
            );

          case "dialogue":
            return (
              <p key={index} className="text-ink mb-4 ml-[12%] max-w-[36ch]">
                {linkify(block.text)}
              </p>
            );

          case "transition":
            return (
              <p
                key={index}
                className="text-sage mt-6 mb-4 text-right text-[0.74rem] tracking-[0.3em]"
              >
                {block.text}
              </p>
            );

          case "entry": {
            // `- demo reel | https://…` or `- full cv on request | you@mail.com`
            // → titled hyperlink, no raw URL/address.
            const note = block.note.trim();
            const noteIsLink =
              URL_ONLY.test(note) ||
              EMAIL_ONLY.test(note) ||
              note.startsWith("mailto:");
            if (noteIsLink) {
              return (
                <p key={index} className="mb-3.5">
                  {externalLink(note, block.text)}
                </p>
              );
            }

            return (
              <div
                key={index}
                className="grid grid-cols-1 gap-1 py-[0.45rem] sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,auto)] sm:items-baseline sm:gap-3"
              >
                <span className="text-ink min-w-0 font-bold tracking-[0.02em]">
                  {linkify(block.text)}
                </span>
                <span
                  aria-hidden
                  className="border-sage/45 hidden min-w-0 -translate-y-[0.3em] border-b border-dotted sm:block"
                />
                {block.note && (
                  <span className="text-ink/75 min-w-0 text-[0.9rem] leading-snug tracking-[0.01em] sm:text-right">
                    {linkify(block.note)}
                  </span>
                )}
              </div>
            );
          }

          case "beat": {
            // Hairline before link/credit lists; plain gap elsewhere.
            const beforeList = blocks[index + 1]?.kind === "entry";
            return beforeList ? (
              <div key={index} aria-hidden className="border-canvas/55 my-5 w-8 border-t" />
            ) : (
              <div key={index} aria-hidden className="h-4" />
            );
          }
        }
      })}
    </div>
  );
}
