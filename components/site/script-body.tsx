import { Fragment } from "react";

import { parseScript } from "@/lib/content/schema";

const EMAIL_OR_URL = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/[^\s]+)/gi;

/** Turn addresses and links into something you can actually click. */
function linkify(text: string) {
  const parts = text.split(EMAIL_OR_URL);
  return parts.map((part, index) => {
    if (!part) return null;
    const isEmail = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(part);
    const isUrl = /^https?:\/\//i.test(part);
    if (!isEmail && !isUrl) return <Fragment key={index}>{part}</Fragment>;

    return (
      <a
        key={index}
        href={isEmail ? `mailto:${part}` : part}
        target={isUrl ? "_blank" : undefined}
        rel={isUrl ? "noreferrer" : undefined}
        className="text-ember decoration-ember/40 hover:decoration-ember underline underline-offset-4 transition-colors duration-300"
      >
        {part}
      </a>
    );
  });
}

/**
 * Renders the screenplay syntax with real script geometry: slug lines flush
 * left, character cues indented, dialogue in a narrow column.
 */
export function ScriptBody({ text }: { text: string }) {
  const blocks = parseScript(text);

  return (
    <div className="text-[0.875rem] leading-[1.95] tracking-[0.01em]">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "scene":
            return (
              <p
                key={index}
                className="border-hairline text-ink mt-1 mb-5 border-b pb-3 text-[0.66rem] tracking-[0.34em]"
              >
                {block.text}
              </p>
            );

          case "action":
            return (
              <p key={index} className="text-ink/80 mb-3 max-w-[46ch]">
                {linkify(block.text)}
              </p>
            );

          case "character":
            return (
              <p
                key={index}
                className="text-ember mt-5 mb-1 ml-[24%] text-[0.7rem] tracking-[0.3em]"
              >
                {block.text}
              </p>
            );

          case "parenthetical":
            return (
              <p key={index} className="text-ink-dim mb-1 ml-[19%] text-[0.78rem]">
                ({block.text})
              </p>
            );

          case "dialogue":
            return (
              <p key={index} className="text-ink mb-4 ml-[12%] max-w-[34ch]">
                {linkify(block.text)}
              </p>
            );

          case "transition":
            return (
              <p
                key={index}
                className="text-ink-faint mt-6 mb-4 text-right text-[0.62rem] tracking-[0.34em]"
              >
                {block.text}
              </p>
            );

          case "entry":
            return (
              <div
                key={index}
                className="group/entry flex items-baseline gap-3 py-[0.3rem]"
              >
                <span className="text-ink group-hover/entry:text-ember shrink-0 transition-colors duration-500">
                  {linkify(block.text)}
                </span>
                <span
                  aria-hidden
                  className="border-hairline min-w-6 flex-1 -translate-y-[0.3em] border-b border-dotted"
                />
                {block.note && (
                  <span className="text-ink-dim shrink-0 text-[0.78rem]">
                    {linkify(block.note)}
                  </span>
                )}
              </div>
            );

          case "beat":
            return <div key={index} aria-hidden className="h-4" />;
        }
      })}
    </div>
  );
}
