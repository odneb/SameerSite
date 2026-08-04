"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";

import { ScriptBody } from "@/components/site/script-body";
import { MAX_LENGTHS, type SiteContent } from "@/lib/content/schema";
import { defaultTheme, type SiteTheme } from "@/lib/content/theme";
import type { SiteRevision } from "@/lib/content/revision-types";

import { submitAction } from "./actions";
import { RevisionsPanel } from "./revisions-panel";
import { initialAdminState } from "./state";

type PanelId = "front" | "design" | "details" | "revisions" | `section-${number}`;

const inputClass =
  "border-hairline focus:border-ember text-ink mt-1.5 w-full rounded-md border bg-white/[0.03] px-3 py-2.5 text-[0.92rem] leading-normal outline-none";

const labelClass = "text-ink block text-[0.82rem] font-semibold tracking-[0.04em]";

const helpClass = "text-ink-dim mt-1.5 text-[0.75rem] leading-relaxed";

export function AdminForm({
  content,
  unpublished,
  revisions,
}: {
  content: SiteContent;
  unpublished: boolean;
  revisions: SiteRevision[];
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
  const [theme, setTheme] = useState<SiteTheme>(content.theme ?? defaultTheme);

  const panels = useMemo(
    () => [
      { id: "front" as const, label: "Front page (name & quote)" },
      ...sections.map((section, index) => ({
        id: `section-${index}` as const,
        label: `${section.number} ${section.label || "page"}`,
      })),
      { id: "design" as const, label: "Colours & type sizes" },
      { id: "details" as const, label: "Footer & search info" },
      { id: "revisions" as const, label: "Revision history" },
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

  const patchTheme = <K extends keyof SiteTheme>(key: K, value: SiteTheme[K]) => {
    setTheme((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="edit-panel" className={labelClass}>
          What do you want to edit?
        </label>
        <select
          id="edit-panel"
          value={panel}
          onChange={(event) => setPanel(event.target.value as PanelId)}
          className={`${inputClass} cursor-pointer appearance-none bg-[length:0.9rem] bg-[right_0.75rem_center] bg-no-repeat pr-10`}
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
          {panel === "revisions"
            ? "Pick a past version and confirm with the password to bring it back."
            : "Pick one thing, edit it, Save, then Publish when you want it live."}
        </p>
      </div>

      {panel === "revisions" ? (
        <RevisionsPanel revisions={revisions} />
      ) : (
        <form action={formAction} className="pb-8">
          <input type="hidden" name="brand.mark" value={content.brand.mark} />
          <input type="hidden" name="brand.name" value={brandName} />
          <input type="hidden" name="brand.role" value={brandRole} />
          <input type="hidden" name="hero.quote" value={quote} />
          <input type="hidden" name="hero.attribution" value={attribution} />
          <input type="hidden" name="footer.copyright" value={footer} />
          <input type="hidden" name="meta.title" value={metaTitle} />
          <input type="hidden" name="meta.description" value={metaDescription} />
          {(
            [
              "void",
              "ink",
              "inkDim",
              "ember",
              "canvas",
              "sage",
              "scale",
              "brandSize",
              "roleSize",
              "quoteSize",
              "navSize",
              "bodySize",
            ] as const
          ).map((key) => (
            <input key={key} type="hidden" name={`theme.${key}`} value={String(theme[key])} />
          ))}
          {sections.map((section, index) => (
            <div key={section.id} className="hidden" aria-hidden>
              <input type="hidden" name={`section.${index}.id`} value={section.id} />
              <input type="hidden" name={`section.${index}.label`} value={section.label} />
              <input type="hidden" name={`section.${index}.script`} value={section.script} />
              <input type="hidden" name={`section.${index}.u`} value={String(section.focus.u)} />
              <input type="hidden" name={`section.${index}.v`} value={String(section.focus.v)} />
            </div>
          ))}

          {panel === "front" && (
            <section className="space-y-5">
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
                help="Example: actor-screenwriter"
              />
              <EditableArea
                label="Front-page quote"
                value={quote}
                onChange={setQuote}
                rows={3}
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
                <p className="text-ink text-[1.1rem] font-bold tracking-[0.24em]">
                  {brandName || "your name"}
                </p>
                <p className="text-ember/90 mt-1.5 text-[0.85rem] tracking-[0.18em]">
                  {brandRole || "your role"}
                </p>
                <div className="mt-5 space-y-1">
                  {quote
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => (
                      <p key={line} className="text-ink text-[0.92rem] leading-relaxed">
                        {line}
                      </p>
                    ))}
                </div>
                {attribution.trim() && (
                  <>
                    <span aria-hidden className="bg-canvas/70 mt-3 block h-px w-6" />
                    <p className="text-ember mt-2 text-[0.8rem] tracking-[0.2em]">
                      {attribution}
                    </p>
                  </>
                )}
              </PreviewBox>
            </section>
          )}

          {activeSection && activeSectionIndex >= 0 && (
            <section className="space-y-5">
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
                rows={12}
                maxLength={MAX_LENGTHS.script}
                help="For a credit or contact line, type: title | detail. Example: email | sameer@swjafar.com"
              />

              <PreviewBox title="How this page will look">
                <h2 className="text-[0.85rem] tracking-[0.24em]">
                  <span className="text-canvas font-bold">{activeSection.number}</span>{" "}
                  <span className="text-ink font-semibold">
                    {activeSection.label || "page"}
                  </span>
                </h2>
                <span aria-hidden className="bg-canvas/60 mt-2.5 mb-4 block h-px w-7" />
                <ScriptBody text={activeSection.script} />
              </PreviewBox>
            </section>
          )}

          {panel === "design" && (
            <section className="space-y-6">
              <p className={helpClass}>
                Change colours with the swatches, or type a hex code. Type sizes are in
                rem. Save, then Publish to put them on the live site.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <ColourField
                  label="Background"
                  value={theme.void}
                  onChange={(value) => patchTheme("void", value)}
                />
                <ColourField
                  label="Main text"
                  value={theme.ink}
                  onChange={(value) => patchTheme("ink", value)}
                />
                <ColourField
                  label="Dim text"
                  value={theme.inkDim}
                  onChange={(value) => patchTheme("inkDim", value)}
                />
                <ColourField
                  label="Brass / gold accent"
                  value={theme.ember}
                  onChange={(value) => patchTheme("ember", value)}
                />
                <ColourField
                  label="Crimson accent"
                  value={theme.canvas}
                  onChange={(value) => patchTheme("canvas", value)}
                />
                <ColourField
                  label="Sage"
                  value={theme.sage}
                  onChange={(value) => patchTheme("sage", value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="Overall type scale"
                  value={theme.scale}
                  min={0.85}
                  max={1.25}
                  step={0.01}
                  onChange={(value) => patchTheme("scale", value)}
                  help="1 = current size. 1.1 = a bit larger everywhere."
                />
                <NumberField
                  label="Name size"
                  value={theme.brandSize}
                  min={0.9}
                  max={2.2}
                  step={0.05}
                  onChange={(value) => patchTheme("brandSize", value)}
                />
                <NumberField
                  label="Role size"
                  value={theme.roleSize}
                  min={0.7}
                  max={1.4}
                  step={0.05}
                  onChange={(value) => patchTheme("roleSize", value)}
                />
                <NumberField
                  label="Quote size"
                  value={theme.quoteSize}
                  min={0.7}
                  max={1.4}
                  step={0.05}
                  onChange={(value) => patchTheme("quoteSize", value)}
                />
                <NumberField
                  label="Menu size"
                  value={theme.navSize}
                  min={0.7}
                  max={1.4}
                  step={0.05}
                  onChange={(value) => patchTheme("navSize", value)}
                />
                <NumberField
                  label="Page body size"
                  value={theme.bodySize}
                  min={0.8}
                  max={1.5}
                  step={0.05}
                  onChange={(value) => patchTheme("bodySize", value)}
                />
              </div>

              <PreviewBox title="Colour swatches">
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      ["Background", theme.void],
                      ["Text", theme.ink],
                      ["Dim", theme.inkDim],
                      ["Brass", theme.ember],
                      ["Crimson", theme.canvas],
                      ["Sage", theme.sage],
                    ] as const
                  ).map(([name, colour]) => (
                    <div key={name} className="w-20">
                      <div
                        className="border-hairline h-12 w-full rounded-md border"
                        style={{ backgroundColor: colour }}
                      />
                      <p className="text-ink-dim mt-1.5 text-[0.7rem]">{name}</p>
                      <p className="text-ink-faint text-[0.65rem]">{colour}</p>
                    </div>
                  ))}
                </div>
                <div
                  className="mt-5 rounded-lg p-4"
                  style={{ backgroundColor: theme.void, color: theme.ink }}
                >
                  <p
                    className="font-bold tracking-[0.2em]"
                    style={{ fontSize: `${theme.brandSize * theme.scale}rem` }}
                  >
                    {brandName || "sameer jafar"}
                  </p>
                  <p
                    className="mt-1 tracking-[0.16em]"
                    style={{
                      color: theme.ember,
                      fontSize: `${theme.roleSize * theme.scale}rem`,
                    }}
                  >
                    {brandRole || "actor-screenwriter"}
                  </p>
                  <p
                    className="mt-4"
                    style={{ fontSize: `${theme.quoteSize * theme.scale}rem` }}
                  >
                    say what must be said.
                  </p>
                  <p
                    className="mt-3 font-semibold"
                    style={{
                      color: theme.canvas,
                      fontSize: `${theme.navSize * theme.scale}rem`,
                    }}
                  >
                    01 acting
                  </p>
                </div>
              </PreviewBox>
            </section>
          )}

          {panel === "details" && (
            <section className="space-y-5">
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
                rows={3}
                maxLength={MAX_LENGTHS.medium}
                help="One or two sentences about you."
              />

              <PreviewBox title="How Google might show it">
                <p className="text-[1rem] font-semibold text-sky-300/90">
                  {metaTitle || "page title"}
                </p>
                <p className="text-ink-dim mt-1.5 text-[0.85rem] leading-relaxed">
                  {metaDescription || "description"}
                </p>
                <p className="text-ink-faint mt-4 text-[0.8rem]">{footer}</p>
              </PreviewBox>
            </section>
          )}

          <div className="border-hairline bg-void/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur-md">
            <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3 px-5 py-3 sm:px-8">
              <button
                type="submit"
                name="intent"
                value="save"
                disabled={pending}
                className="bg-ink text-void hover:bg-ember min-h-10 rounded-lg px-4 text-[0.85rem] font-semibold tracking-[0.04em] transition-colors disabled:opacity-40"
              >
                {pending ? "Saving…" : "Save"}
              </button>

              <button
                type="submit"
                name="intent"
                value="publish"
                disabled={pending}
                className="border-ember text-ember hover:bg-ember hover:text-void min-h-10 rounded-lg border px-4 text-[0.85rem] font-semibold tracking-[0.04em] transition-colors disabled:opacity-40"
              >
                {pending ? "Working…" : "Publish"}
              </button>

              <p
                role="status"
                aria-live="polite"
                className="text-[0.78rem] sm:ml-auto sm:max-w-[30ch] sm:text-right"
              >
                {state.message ? (
                  <span className={state.status === "error" ? "text-ember" : "text-ink"}>
                    {state.message}
                  </span>
                ) : unpublished ? (
                  <span className="text-ink-dim">Saved, not live yet — press Publish.</span>
                ) : (
                  <span className="text-ink-faint">Matches the live site.</span>
                )}
              </p>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="mt-1.5 flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="border-hairline h-10 w-12 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={7}
          spellCheck={false}
          className={`${inputClass} mt-0 font-mono uppercase`}
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  help,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  help?: string;
}) {
  return (
    <div>
      <label className={labelClass}>
        {label}
        <span className="text-ink-faint ml-2 font-normal">{value}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-[var(--color-ember)]"
      />
      {help && <p className={helpClass}>{help}</p>}
    </div>
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
    <div className="border-hairline rounded-xl border bg-black/25 p-4 md:p-5">
      <p className="text-ink-dim mb-3 text-[0.75rem] font-semibold tracking-[0.06em]">
        {title}
      </p>
      <div className="plate-type">{children}</div>
    </div>
  );
}
