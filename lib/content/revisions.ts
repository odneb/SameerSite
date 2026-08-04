/**
 * Append-only revision log of published site snapshots.
 * Entries are never deleted or rewritten — restores add a new entry.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import type { SiteRevision } from "./revision-types";
import { sanitizeContent, type SiteContent } from "./schema";

export type { SiteRevision };

const REVISIONS_KEY = "content/revisions.json";

type Backend = "blob" | "file";

function backend(): Backend {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "file";
}

async function readRaw(key: string): Promise<string | null> {
  if (backend() === "blob") {
    const { get } = await import("@vercel/blob");
    try {
      const result = await get(key, { access: "private", useCache: false });
      if (!result?.stream) return null;
      return await new Response(result.stream).text();
    } catch {
      return null;
    }
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  try {
    return await fs.readFile(
      path.join(process.cwd(), ".data", key.replace("content/", "")),
      "utf8",
    );
  } catch {
    return null;
  }
}

async function writeRaw(key: string, body: string) {
  if (backend() === "blob") {
    const { put } = await import("@vercel/blob");
    await put(key, body, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
    return;
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const target = path.join(process.cwd(), ".data", key.replace("content/", ""));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body, "utf8");
}

function parseLog(raw: string | null): SiteRevision[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is SiteRevision => {
        return (
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as SiteRevision).id === "string" &&
          typeof (entry as SiteRevision).createdAt === "string" &&
          (entry as SiteRevision).content != null
        );
      })
      .map((entry) => ({
        ...entry,
        content: sanitizeContent(entry.content),
        kind: entry.kind === "restore" ? "restore" : "publish",
        label: typeof entry.label === "string" ? entry.label : entry.createdAt,
      }));
  } catch {
    return [];
  }
}

/** Newest first. Never mutates or drops history. */
export async function listRevisions(): Promise<SiteRevision[]> {
  const log = parseLog(await readRaw(REVISIONS_KEY));
  return [...log].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getRevision(id: string): Promise<SiteRevision | null> {
  const log = parseLog(await readRaw(REVISIONS_KEY));
  return log.find((entry) => entry.id === id) ?? null;
}

/**
 * Append a revision. Existing entries are left untouched.
 */
export async function appendRevision(input: {
  kind: "publish" | "restore";
  content: SiteContent;
  label?: string;
  restoredFromId?: string;
}): Promise<SiteRevision> {
  const existing = parseLog(await readRaw(REVISIONS_KEY));
  const createdAt = new Date().toISOString();
  const entry: SiteRevision = {
    id: randomUUID(),
    createdAt,
    kind: input.kind,
    label:
      input.label ??
      (input.kind === "restore"
        ? `Restored ${createdAt}`
        : `Published ${createdAt}`),
    ...(input.restoredFromId ? { restoredFromId: input.restoredFromId } : {}),
    content: sanitizeContent(input.content),
  };

  // Append only — never rewrite or prune prior entries.
  const next = [...existing, entry];
  await writeRaw(REVISIONS_KEY, `${JSON.stringify(next, null, 2)}\n`);
  return entry;
}
