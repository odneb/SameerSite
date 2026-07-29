"use client";

import { useActionState } from "react";

import { MAX_LENGTHS, type SiteContent } from "@/lib/content/schema";

import { submitAction } from "./actions";
import { initialAdminState } from "./state";

const fieldClass =
  "border-hairline focus:border-ember text-ink w-full border-b bg-transparent pb-2 text-[0.82rem] outline-none transition-colors duration-500";

const labelClass = "text-ink-dim block text-[0.58rem] tracking-[0.3em]";

function Field({
  label,
  name,
  defaultValue,
  maxLength,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  maxLength: number;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        defaultValue={defaultValue}
        maxLength={maxLength}
        className={`${fieldClass} mt-2.5`}
      />
      {hint && <p className="text-ink-faint mt-2 text-[0.56rem] tracking-[0.16em]">{hint}</p>}
    </div>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  rows,
  maxLength,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  rows: number;
  maxLength: number;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        maxLength={maxLength}
        spellCheck
        className={`${fieldClass} mt-2.5 resize-y leading-[1.9]`}
      />
      {hint && <p className="text-ink-faint mt-2 text-[0.56rem] tracking-[0.16em]">{hint}</p>}
    </div>
  );
}

export function AdminForm({
  content,
  unpublished,
}: {
  content: SiteContent;
  unpublished: boolean;
}) {
  const [state, formAction, pending] = useActionState(submitAction, initialAdminState);

  return (
    <form action={formAction} className="pb-32">
      <div className="space-y-16">
        <section className="space-y-8">
          <h2 className="text-ink-faint border-hairline border-b pb-3 text-[0.58rem] tracking-[0.34em]">
            title card
          </h2>
          <div className="grid gap-8 md:grid-cols-2">
            <Field
              label="name"
              name="brand.name"
              defaultValue={content.brand.name}
              maxLength={MAX_LENGTHS.short}
            />
            <Field
              label="role"
              name="brand.role"
              defaultValue={content.brand.role}
              maxLength={MAX_LENGTHS.short}
            />
          </div>
          <TextArea
            label="standing quote"
            name="hero.quote"
            defaultValue={content.hero.quote}
            rows={4}
            maxLength={MAX_LENGTHS.medium}
            hint="one line per line. it breaks exactly where you break it."
          />
          <Field
            label="under the quote"
            name="hero.attribution"
            defaultValue={content.hero.attribution}
            maxLength={MAX_LENGTHS.short}
          />
        </section>

        <section className="space-y-12">
          <div className="border-hairline flex items-baseline justify-between gap-6 border-b pb-3">
            <h2 className="text-ink-faint text-[0.58rem] tracking-[0.34em]">pages</h2>
            <ScriptLegend />
          </div>

          {content.sections.map((section, index) => (
            <div key={section.id} className="space-y-6">
              <input type="hidden" name={`section.${index}.id`} value={section.id} />

              <div className="flex items-baseline gap-5">
                <span className="text-ember text-[0.62rem] tracking-[0.3em]">
                  {section.number}
                </span>
                <div className="flex-1">
                  <Field
                    label="page name"
                    name={`section.${index}.label`}
                    defaultValue={section.label}
                    maxLength={40}
                  />
                </div>
              </div>

              <TextArea
                label="page"
                name={`section.${index}.script`}
                defaultValue={section.script}
                rows={14}
                maxLength={MAX_LENGTHS.script}
              />

              <div className="flex flex-wrap items-end gap-8">
                <div>
                  <label
                    htmlFor={`section.${index}.u`}
                    className="text-ink-faint block text-[0.54rem] tracking-[0.26em]"
                  >
                    camera across
                  </label>
                  <input
                    id={`section.${index}.u`}
                    name={`section.${index}.u`}
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    defaultValue={section.focus.u}
                    className={`${fieldClass} mt-2 w-24`}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`section.${index}.v`}
                    className="text-ink-faint block text-[0.54rem] tracking-[0.26em]"
                  >
                    camera down
                  </label>
                  <input
                    id={`section.${index}.v`}
                    name={`section.${index}.v`}
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    defaultValue={section.focus.v}
                    className={`${fieldClass} mt-2 w-24`}
                  />
                </div>
                <p className="text-ink-faint max-w-[34ch] text-[0.54rem] leading-relaxed tracking-[0.14em]">
                  where the camera drifts on this page. 0 to 1, left to right and top to
                  bottom.
                </p>
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-8">
          <h2 className="text-ink-faint border-hairline border-b pb-3 text-[0.58rem] tracking-[0.34em]">
            small print
          </h2>
          <Field
            label="footer"
            name="footer.copyright"
            defaultValue={content.footer.copyright}
            maxLength={MAX_LENGTHS.short}
          />
          <Field
            label="browser tab title"
            name="meta.title"
            defaultValue={content.meta.title}
            maxLength={MAX_LENGTHS.short}
          />
          <TextArea
            label="search description"
            name="meta.description"
            defaultValue={content.meta.description}
            rows={3}
            maxLength={MAX_LENGTHS.medium}
            hint="what google shows under the link."
          />
          <input type="hidden" name="brand.mark" value={content.brand.mark} />
        </section>
      </div>

      {/* Action bar stays put so publishing is never more than one reach away. */}
      <div className="border-hairline bg-void/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-7 gap-y-3 px-7 py-5 md:px-10">
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={pending}
            className="text-ink-dim hover:text-ink text-[0.6rem] tracking-[0.32em] transition-colors duration-500 disabled:opacity-40"
          >
            {pending ? "working" : "save draft"}
          </button>

          <button
            type="submit"
            name="intent"
            value="publish"
            disabled={pending}
            className="text-ember hover:text-ink text-[0.6rem] tracking-[0.32em] transition-colors duration-500 disabled:opacity-40"
          >
            publish
          </button>

          <a
            href="/preview"
            target="_blank"
            rel="noreferrer"
            className="text-ink-faint hover:text-ink-dim text-[0.6rem] tracking-[0.32em] transition-colors duration-500"
          >
            preview draft
          </a>

          <p
            role="status"
            aria-live="polite"
            className="ml-auto text-[0.58rem] tracking-[0.2em]"
          >
            {state.message ? (
              <span className={state.status === "error" ? "text-ember" : "text-ink-dim"}>
                {state.message}
              </span>
            ) : unpublished ? (
              <span className="text-ink-faint">
                draft is ahead of what&apos;s live.
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </form>
  );
}

function ScriptLegend() {
  const rows = [
    [">", "scene heading"],
    ["@", "who's speaking"],
    [":", "what they say"],
    ["(", "how they say it )"],
    ["-", "list item | note"],
    ["=", "transition"],
    ["", "anything else is action"],
  ];

  return (
    <details className="text-[0.56rem] tracking-[0.2em]">
      <summary className="text-ink-faint hover:text-ink-dim cursor-pointer">
        how to format
      </summary>
      <dl className="text-ink-faint mt-4 space-y-1.5">
        {rows.map(([symbol, meaning]) => (
          <div key={meaning} className="flex gap-3">
            <dt className="text-ember w-3 shrink-0">{symbol}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
