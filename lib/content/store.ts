/**
 * Content persistence.
 *
 * Two backends, chosen automatically:
 *
 *   - Vercel Blob, when BLOB_READ_WRITE_TOKEN is set (i.e. in production).
 *   - A JSON file under .data/, for local development.
 *
 * There are exactly two documents: a draft the dashboard writes to, and the
 * published version the public site reads. Publishing copies one to the other.
 */

import "server-only";

import { defaultContent, sanitizeContent, type SiteContent } from "./schema";

const DRAFT_KEY = "content/draft.json";
const PUBLISHED_KEY = "content/published.json";

type Backend = "blob" | "file";

function backend(): Backend {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "file";
}

async function readBlob(key: string): Promise<SiteContent | null> {
  const { head } = await import("@vercel/blob");
  try {
    const meta = await head(key);
    const response = await fetch(meta.url, { cache: "no-store" });
    if (!response.ok) return null;
    return sanitizeContent(await response.json());
  } catch {
    // head() throws when the blob does not exist yet, which is the normal
    // state of a fresh deployment.
    return null;
  }
}

async function writeBlob(key: string, content: SiteContent) {
  const { put } = await import("@vercel/blob");
  await put(key, JSON.stringify(content, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

async function filePath(key: string) {
  const path = await import("node:path");
  return path.join(process.cwd(), ".data", key.replace("content/", ""));
}

async function readFileStore(key: string): Promise<SiteContent | null> {
  const fs = await import("node:fs/promises");
  try {
    const raw = await fs.readFile(await filePath(key), "utf8");
    return sanitizeContent(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeFileStore(key: string, content: SiteContent) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const target = await filePath(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(content, null, 2), "utf8");
}

async function read(key: string) {
  return backend() === "blob" ? readBlob(key) : readFileStore(key);
}

async function write(key: string, content: SiteContent) {
  return backend() === "blob"
    ? writeBlob(key, content)
    : writeFileStore(key, content);
}

/** What the public site renders. Falls back to the shipped copy. */
export async function getPublishedContent(): Promise<SiteContent> {
  return (await read(PUBLISHED_KEY)) ?? defaultContent;
}

/** What the dashboard edits. Falls back to published, then to shipped copy. */
export async function getDraftContent(): Promise<SiteContent> {
  return (await read(DRAFT_KEY)) ?? (await getPublishedContent());
}

export async function saveDraft(input: unknown): Promise<SiteContent> {
  const content = sanitizeContent(input);
  await write(DRAFT_KEY, content);
  return content;
}

/** Promote the current draft to live. */
export async function publishDraft(): Promise<SiteContent> {
  const draft = await getDraftContent();
  await write(PUBLISHED_KEY, draft);
  return draft;
}

/** Throw away local edits and start again from what's live. */
export async function discardDraft(): Promise<SiteContent> {
  const published = await getPublishedContent();
  await write(DRAFT_KEY, published);
  return published;
}

export async function hasUnpublishedChanges(): Promise<boolean> {
  const [draft, published] = await Promise.all([
    read(DRAFT_KEY),
    read(PUBLISHED_KEY),
  ]);
  if (!draft) return false;
  return JSON.stringify(draft) !== JSON.stringify(published ?? defaultContent);
}
