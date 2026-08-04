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
  /** Optional portrait shown above the section body (contact). */
  portrait?: string;
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
 *   - demo reel | https://…       titled hyperlink (label only, URL hidden)
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
      const [text, ...rest] = line.slice(1).split("|");
      blocks.push({
        kind: "entry",
        text: text.trim(),
        note: rest.map((part) => part.trim()).filter(Boolean).join(" · "),
      });
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
    title: "sameer jafar — actor-screenwriter",
    description:
      "sameer jafar. screenwriter and actor, toronto. selected work, and how to reach him.",
  },
  brand: {
    name: "sameer jafar",
    role: "actor-screenwriter",
    mark: "s.w.j.",
  },
  hero: {
    quote: "say what must be said.\ndo what must be done.",
    attribution: "toronto",
  },
  sections: [
    {
      id: "acting",
      number: "01",
      label: "acting",
      focus: { u: 0.24, v: 0.35 },
      script: `- overcompensating | a24 / mgm | recurring
- shoresy | crave / bell media | recurring
- saint pierre | cbc | recurring

- full cv on request | faith@element-artist.com

- demo reel | https://vimeo.com/717302713/9c9bb5dbdc
- imdb | https://www.imdb.com/name/nm10475976/?ref_=ext_shr_lnk`,
    },
    {
      id: "writing",
      number: "02",
      label: "writing",
      focus: { u: 0.34, v: 0.42 },
      script: `- spray | pilot. hour long drama. in development.
- kensington hustle | feature. in development.
- party people | feature. in development.
- pushers | feature. in development.
- better than a mustache | short. festival run, 2025.
- shoeshine | short. festival run. 2023
- alternating current | short. festival run. 2022
- i feel uncomfortable on the balcony | short. festival run. 2021

pages available on request. i'd rather you read them than read about them.`,
    },
    {
      id: "about",
      number: "03",
      label: "contact",
      portrait: "/scene/contact-portrait.jpg",
      focus: { u: 0.34, v: 0.28 },
      script: `- email | sameer@swjafar.com
- acting representation | faith@element-artist.com

sameer is a toronto-based actor and screenwriter. his characters are shaped by where they come from and undone by where they're going. his work is funny about serious things.

meisner-trained. actra member. currently in development on spray, an hour-long drama.

toronto, and wherever the work is.`,
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
    const trimmed = value.replace(/\r\n/g, "\n").trim().toLowerCase();
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

      const portraitRaw =
        typeof section?.portrait === "string"
          ? section.portrait.trim()
          : fallback.portrait;
      const portrait =
        portraitRaw &&
        (portraitRaw.startsWith("/") || portraitRaw.startsWith("https://"))
          ? portraitRaw.slice(0, 240)
          : undefined;

      return {
        id,
        number: String(index + 1).padStart(2, "0"),
        label: text(section?.label, fallback.label, 40),
        script: text(section?.script, fallback.script, MAX_LENGTHS.script),
        ...(portrait ? { portrait } : {}),
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
