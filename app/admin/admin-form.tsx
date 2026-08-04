"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";

import { ScriptBody } from "@/components/site/script-body";
import { MAX_LENGTHS, type SiteContent } from "@/lib/content/schema";

import { submitAction } from "./actions";
import { initialAdminState } from "./state";

type PanelId = "front" | "details" | `section-${number}`;

const inputClass =
  "border-hairline focus:border-ember text-ink mt-2 w-full rounded-lg border bg-white/[0.03] px-4 py-3.5 text-[1.05rem] leading-normal outline-none";

const labelClass = "text-ink block text-[1rem] font-semibold tracking-[0.04em]";

const helpClass = "text-ink-dim mt-2 text-[0.95rem] leading-relaxed";

export function AdminForm({
  content,
  unpublished,
}: {
  content: SiteContent;
  unpublished: boolean;
}) {
  const [state, formAction, pending] = useActionState(submitAction, initialAdminState);
  const [panel, setPanel] = useState<PanelId>("front");

  const [brandName, setBrandName] = useState(content.brand.name);
  const [brandRole, setBrandRole] = useState(content.brand.role);
  const [quote, setQuote] = useState(content.hero.quote);
  const [attribution, setAttribution] = useState(content.hero.attribution);
  const [footer, setFooter] = useState(content.footer.copyright);
  const [metaTitle, setMetaTitle] = useState(content.meta.title);
  const [metaDescription, setMetaDescription] = useState(content.meta.description);
  const [sections, setSections] = useState(content.sections);

  const panels = useMemo(
    () => [
      { id: "front" as const, label: "Front page (name & quote)" },
      ...sections.map((section, index) => ({
        id: `section-${index}` as const,
        label: `${section.number} ${section.label || "page"}`,
      })),
      { id: "details" as const, label: "Footer & search info" },
    ],
    [sections],
  );

  const activeSectionIndex =
    panel.startsWith("section-") ? Number(panel.replace("section-", "")) : -1;
  const activeSection =
    activeSectionIndex >= 0 ? sections[activeSectionIndex] : null;

  const updateSection = (
    index: number,
    key: "label" | "script",
    value: string,
  ) => {
    setSections((prev) =>
      prev.map((section, i) => (i === index ? { ...section, [key]: value } : section)),
    );
  };

  return (
    <form action={formAction} className="pb-40">
      {/* Keep every field in the form so Save always writes the whole site. */}
      <input type="hidden" name="brand.mark" value={content.brand.mark} />
      <input type="hidden" name="brand.name" value={brandName} />
      <input type="hidden" name="brand.role" value={brandRole} />
      <input type="hidden" name="hero.quote" value={quote} />
      <input type="hidden" name="hero.attribution" value={attribution} />
      <input type="hidden" name="footer.copyright" value={footer} />
      <input type="hidden" name="meta.title" value={metaTitle} />
      <input type="hidden" name="meta.description" value={metaDescription} />
      {sections.map((section, index) => (
        <div key={section.id} className="hidden" aria-hidden>
          <input type="hidden" name={`section.${index}.id`} value={section.id} />
          <input type="hidden" name={`section.${index}.label`} value={section.label} />
          <input type="hidden" name={`section.${index}.script`} value={section.script} />
          <input type="hidden" name={`section.${index}.u`} value={String(section.focus.u)} />
          <input type="hidden" name={`section.${index}.v`} value={String(section.focus.v)} />
        </div>
      ))}

      <div className="space-y-8">
        <div>
          <label htmlFor="edit-panel" className={labelClass}>
            What do you want to edit?
          </label>
          <select
            id="edit-panel"
            value={panel}
            onChange={(event) => setPanel(event.target.value as PanelId)}
            className={`${inputClass} cursor-pointer appearance-none bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-12`}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%9a9080'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            }}
          >
            {panels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <p className={helpClass}>
            Pick one thing, change it, then press Save. Press Publish when you want the
            live website to update.
          </p>
        </div>

        {panel === "front" && (
          <section className="space-y-8">
            <EditableField
              label="Your name (top of the site)"
              value={brandName}
              onChange={setBrandName}
              maxLength={MAX_LENGTHS.short}
            />
            <EditableField
              label="Your role (under your name)"
              value={brandRole}
              onChange={setBrandRole}
              maxLength={MAX_LENGTHS.short}
              help='Example: actor-screenwriter'
            />
            <EditableArea
              label="Front-page quote"
              value={quote}
              onChange={setQuote}
              rows={4}
              maxLength={MAX_LENGTHS.medium}
              help="Put each sentence on its own line."
            />
            <EditableField
              label="Line under the quote"
              value={attribution}
              onChange={setAttribution}
              maxLength={MAX_LENGTHS.short}
              help='Usually "toronto"'
            />

            <PreviewBox title="How it will look">
              <p className="text-ink text-[1.35rem] font-bold tracking-[0.28em]">
                {brandName || "your name"}
              </p>
              <p className="text-ember/90 mt-2 text-[1rem] tracking-[0.2em]">
                {brandRole || "your role"}
              </p>
              <div className="mt-8 space-y-1">
                {quote
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => (
                    <p key={line} className="text-ink text-[1.05rem] leading-relaxed">
                      {line}
                    </p>
                  ))}
              </div>
              {attribution.trim() && (
                <>
                  <span aria-hidden className="bg-canvas/70 mt-4 block h-px w-8" />
                  <p className="text-ember mt-3 text-[0.95rem] tracking-[0.24em]">
                    {attribution}
                  </p>
                </>
              )}
            </PreviewBox>
          </section>
        )}

        {activeSection && activeSectionIndex >= 0 && (
          <section className="space-y-8">
            <EditableField
              label="Page name (in the menu)"
              value={activeSection.label}
              onChange={(value) => updateSection(activeSectionIndex, "label", value)}
              maxLength={40}
            />
            <EditableArea
              label="Page content"
              value={activeSection.script}
              onChange={(value) => updateSection(activeSectionIndex, "script", value)}
              rows={16}
              maxLength={MAX_LENGTHS.script}
              help="For a credit or contact line, type: title | detail. Example: email | sameer@swjafar.com"
            />

            <PreviewBox title="How this page will look">
              <h2 className="text-[1rem] tracking-[0.28em]">
                <span className="text-canvas font-bold">{activeSection.number}</span>{" "}
                <span className="text-ink font-semibold">
                  {activeSection.label || "page"}
                </span>
              </h2>
              <span aria-hidden className="bg-canvas/60 mt-3 mb-6 block h-px w-8" />
              <ScriptBody text={activeSection.script} />
            </PreviewBox>
          </section>
        )}

        {panel === "details" && (
          <section className="space-y-8">
            <EditableField
              label="Footer line"
              value={footer}
              onChange={setFooter}
              maxLength={MAX_LENGTHS.short}
            />
            <EditableField
              label="Browser tab title"
              value={metaTitle}
              onChange={setMetaTitle}
              maxLength={MAX_LENGTHS.short}
              help="The words in the browser tab and Google link title."
            />
            <EditableArea
              label="Short description for Google"
              value={metaDescription}
              onChange={setMetaDescription}
              rows={4}
              maxLength={MAX_LENGTHS.medium}
              help="One or two sentences about you."
            />

            <PreviewBox title="How Google might show it">
              <p className="text-[1.15rem] font-semibold text-sky-300/90">
                {metaTitle || "page title"}
              </p>
              <p className="text-ink-dim mt-2 text-[1rem] leading-relaxed">
                {metaDescription || "description"}
              </p>
              <p className="text-ink-faint mt-6 text-[0.95rem]">{footer}</p>
            </PreviewBox>
          </section>
        )}
      </div>

      <div className="border-hairline bg-void/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-5 sm:flex-row sm:flex-wrap sm:items-center sm:px-10">
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={pending}
            className="bg-ink text-void hover:bg-ember min-h-14 rounded-xl px-6 text-[1.05rem] font-semibold tracking-[0.04em] transition-colors disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save"}
          </button>

          <button
            type="submit"
            name="intent"
            value="publish"
            disabled={pending}
            className="border-ember text-ember hover:bg-ember hover:text-void min-h-14 rounded-xl border px-6 text-[1.05rem] font-semibold tracking-[0.04em] transition-colors disabled:opacity-40"
          >
            {pending ? "Working…" : "Publish to live site"}
          </button>

          <p
            role="status"
            aria-live="polite"
            className="text-[1rem] sm:ml-auto sm:max-w-[28ch] sm:text-right"
          >
            {state.message ? (
              <span className={state.status === "error" ? "text-ember" : "text-ink"}>
                {state.message}
              </span>
            ) : unpublished ? (
              <span className="text-ink-dim">
                You have saved changes that are not live yet. Press Publish when ready.
              </span>
            ) : (
              <span className="text-ink-faint">Saved copy matches the live site.</span>
            )}
          </p>
        </div>
      </div>
    </form>
  );
}

function EditableField({
  label,
  value,
  onChange,
  maxLength,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  help?: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        className={inputClass}
      />
      {help && <p className={helpClass}>{help}</p>}
    </div>
  );
}

function EditableArea({
  label,
  value,
  onChange,
  rows,
  maxLength,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  maxLength: number;
  help?: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        maxLength={maxLength}
        spellCheck
        className={`${inputClass} resize-y leading-[1.7]`}
      />
      {help && <p className={helpClass}>{help}</p>}
    </div>
  );
}

function PreviewBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-hairline rounded-2xl border bg-black/25 p-5 md:p-7">
      <p className="text-ink-dim mb-5 text-[0.95rem] font-semibold tracking-[0.06em]">
        {title}
      </p>
      <div className="plate-type">{children}</div>
    </div>
  );
}
