/**
 * The site's entire editable surface.
 *
 * Section bodies are stored as plain text in a small screenplay syntax so the
 * dashboard can stay a handful of textareas rather than a rich text editor.
 */

export type SiteContent = {
  meta: {
    title: string;
    description: string;
  };
  brand: {
    name: string;
    role: string;
    mark: string;
  };
  hero: {
    quote: string;
    attribution: string;
  };
  sections: Section[];
  footer: {
    copyright: string;
  };
};

export type Section = {
  id: string;
  /** Displayed as "01.", "02." and so on. */
  number: string;
  label: string;
  /** Screenplay-syntax body. See parseScript. */
  script: string;
  /**
   * Where the camera drifts when this section is open, in normalized plate
   * space. Lets each section frame a different part of the room.
   */
  focus: { u: number; v: number };
};

export const MAX_LENGTHS = {
  short: 120,
  medium: 400,
  script: 6000,
} as const;

export const SECTION_LIMIT = 10;

/**
 * Screenplay syntax:
 *
 *   > int. a room — 4:00 a.m.     scene heading
 *   @ sameer                      character cue
 *   ( quietly )                   parenthetical
 *   : the line itself             dialogue
 *   = cut to:                     transition
 *   - a titled entry | a note     list entry
 *   anything else                 action
 *   (blank line)                  beat
 */
export type ScriptBlock =
  | { kind: "scene"; text: string }
  | { kind: "action"; text: string }
  | { kind: "character"; text: string }
  | { kind: "parenthetical"; text: string }
  | { kind: "dialogue"; text: string }
  | { kind: "transition"; text: string }
  | { kind: "entry"; text: string; note: string }
  | { kind: "beat" };

export function parseScript(script: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];

  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      // Collapse runs of blank lines into a single beat.
      if (blocks.at(-1)?.kind !== "beat") blocks.push({ kind: "beat" });
      continue;
    }

    if (line.startsWith(">")) {
      blocks.push({ kind: "scene", text: line.slice(1).trim() });
    } else if (line.startsWith("@")) {
      blocks.push({ kind: "character", text: line.slice(1).trim() });
    } else if (line.startsWith(":")) {
      blocks.push({ kind: "dialogue", text: line.slice(1).trim() });
    } else if (line.startsWith("=")) {
      blocks.push({ kind: "transition", text: line.slice(1).trim() });
    } else if (line.startsWith("-")) {
      const [text, note = ""] = line.slice(1).split("|");
      blocks.push({ kind: "entry", text: text.trim(), note: note.trim() });
    } else if (line.startsWith("(") && line.endsWith(")")) {
      blocks.push({ kind: "parenthetical", text: line.slice(1, -1).trim() });
    } else {
      blocks.push({ kind: "action", text: line });
    }
  }

  // A trailing beat only adds dead space.
  if (blocks.at(-1)?.kind === "beat") blocks.pop();
  return blocks;
}

export const defaultContent: SiteContent = {
  meta: {
    title: "s.w. jafar — scriptwriter, actor",
    description:
      "sameer jafar. scriptwriter and actor, toronto. selected work, and how to reach him.",
  },
  brand: {
    name: "s.w. jafar",
    role: "scriptwriter. actor.",
    mark: "s.w.j.",
  },
  hero: {
    quote: "i write\nto make sense\nof things that\ndon't make sense.",
    attribution: "toronto",
  },
  sections: [
    {
      id: "writing",
      number: "01",
      label: "writing",
      focus: { u: 0.34, v: 0.42 },
      script: `> int. a room in toronto — 4:00 a.m.

the work is mostly waiting. then, for about an hour, it isn't.

= selected

- the quiet part | feature. in development.
- nazar | feature. first draft. with producers.
- borrowed light | pilot. optioned, 2025.
- a good son | short. festival run, 2024.

there are two others i'm not allowed to name yet.

@ sameer
( on process )
: i don't outline. i listen until the room starts talking, and then i take dictation.

= end of excerpt

pages available on request. i'd rather you read them than read about them.`,
    },
    {
      id: "film",
      number: "02",
      label: "film",
      focus: { u: 0.72, v: 0.5 },
      script: `> ext. somewhere off dundas — blue hour

i direct the way i write. one true thing, then the next one.

the camera is a witness, not a narrator. it doesn't explain. it stays in the room a beat longer than is comfortable, and something honest happens.

= reels

- the quiet part — proof of concept | 4 min. password on request.
- nazar — teaser | 2 min. private link.
- selected commercial work | on request.

@ sameer
: give me a small budget and a hard deadline and i'll give you something that doesn't look like anything else.`,
    },
    {
      id: "acting",
      number: "03",
      label: "acting",
      focus: { u: 0.24, v: 0.35 },
      script: `> int. a bare stage — a single work light

i started on the other side of it. i still take the work when the part is worth the trouble.

- theatre | tarragon, factory, buddies. 2018 – 2022.
- screen | independent features, two series regulars, one you'd recognise.
- training | conservatory, then eight years of being wrong in public.

@ sameer
( flatly )
: i'm good in a room. i'm better on a page. i'm best when nobody's told me what the scene is about.

= cut to

full resume and self-tapes on request.`,
    },
    {
      id: "journal",
      number: "04",
      label: "journal",
      focus: { u: 0.5, v: 0.62 },
      script: `> int. the same room — different night

notes i keep so i don't lose them.

= march

nobody in a good scene knows they're in a scene. that's the whole trick.

= february

wrote nine pages. kept one line. it was the right line.

= january

my grandfather told stories out of order on purpose. i understand now — he was protecting the ending.

= november

toronto in the winter is the best writing partner i've had. it never asks how it's going.`,
    },
    {
      id: "about",
      number: "05",
      label: "about",
      focus: { u: 0.34, v: 0.28 },
      script: `> int. kitchen — late

sameer jafar writes and directs out of toronto.

he grew up between two languages and never fully trusted either one, which turned out to be useful. he writes about families that love each other badly, cities that don't apologise, and men who explain themselves too late.

he has been described, by people who meant it kindly, as difficult to categorise.

= the short version

- writes | features, pilots, the occasional short.
- directs | when the material asks for it.
- acts | when the part is worth the trouble.
- based | toronto. travels for the right room.

@ sameer
: i'm not interested in being the loudest thing in the room. i'm interested in being the thing you think about on the drive home.`,
    },
    {
      id: "contact",
      number: "06",
      label: "contact",
      focus: { u: 0.44, v: 0.5 },
      script: `> int. anywhere — now

if you've read this far, you already know.

- email | hello@swjafar.com
- representation | on request.
- toronto | and wherever the work is.

send a sentence about what you're making. that's enough to start.

= fade out`,
    },
  ],
  footer: {
    copyright: "© s.w. jafar   all rights reserved",
  },
};

/** Trim, cap and shape untrusted input from the dashboard. */
export function sanitizeContent(input: unknown): SiteContent {
  const source = (input ?? {}) as Partial<SiteContent>;

  const text = (value: unknown, fallback: string, max: number) => {
    if (typeof value !== "string") return fallback;
    const trimmed = value.replace(/\r\n/g, "\n").trim();
    return trimmed.slice(0, max);
  };

  const rawSections = Array.isArray(source.sections) ? source.sections : [];
  // An empty nav would leave the site unusable and unrecoverable from the
  // dashboard, so fall back rather than accept it.
  const sections = rawSections.length > 0 ? rawSections : defaultContent.sections;

  return {
    meta: {
      title: text(source.meta?.title, defaultContent.meta.title, MAX_LENGTHS.short),
      description: text(
        source.meta?.description,
        defaultContent.meta.description,
        MAX_LENGTHS.medium,
      ),
    },
    brand: {
      name: text(source.brand?.name, defaultContent.brand.name, MAX_LENGTHS.short),
      role: text(source.brand?.role, defaultContent.brand.role, MAX_LENGTHS.short),
      mark: text(source.brand?.mark, defaultContent.brand.mark, MAX_LENGTHS.short),
    },
    hero: {
      quote: text(source.hero?.quote, defaultContent.hero.quote, MAX_LENGTHS.medium),
      attribution: text(
        source.hero?.attribution,
        defaultContent.hero.attribution,
        MAX_LENGTHS.short,
      ),
    },
    sections: sections.slice(0, SECTION_LIMIT).map((section, index) => {
      const fallback = defaultContent.sections[index] ?? defaultContent.sections[0];
      const id =
        text(section?.id, fallback.id, 48)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") || `section-${index + 1}`;

      const clamp = (value: unknown, fallbackValue: number) => {
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallbackValue;
      };

      return {
        id,
        number: String(index + 1).padStart(2, "0"),
        label: text(section?.label, fallback.label, 40),
        script: text(section?.script, fallback.script, MAX_LENGTHS.script),
        focus: {
          u: clamp(section?.focus?.u, fallback.focus.u),
          v: clamp(section?.focus?.v, fallback.focus.v),
        },
      };
    }),
    footer: {
      copyright: text(
        source.footer?.copyright,
        defaultContent.footer.copyright,
        MAX_LENGTHS.short,
      ),
    },
  };
}
