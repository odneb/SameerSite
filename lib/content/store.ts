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

import { appendRevision } from "./revisions";
import { defaultContent, sanitizeContent, type SiteContent } from "./schema";

const DRAFT_KEY = "content/draft.json";
const PUBLISHED_KEY = "content/published.json";

type Backend = "blob" | "file";

function backend(): Backend {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "file";
}

async function readBlob(key: string): Promise<SiteContent | null> {
  const { get } = await import("@vercel/blob");
  try {
    // Store is private — use the authenticated get() path, not a public URL.
    const result = await get(key, { access: "private", useCache: false });
    if (!result?.stream) return null;
    const raw = await new Response(result.stream).text();
    return sanitizeContent(JSON.parse(raw));
  } catch {
    // Missing blob is the normal state of a fresh deployment.
    return null;
  }
}

async function writeBlob(key: string, content: SiteContent) {
  const { put } = await import("@vercel/blob");
  await put(key, JSON.stringify(content, null, 2), {
    access: "private",
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

/** Promote the current draft to live and append an immutable revision. */
export async function publishDraft(): Promise<SiteContent> {
  const draft = await getDraftContent();
  await write(PUBLISHED_KEY, draft);
  const stamp = new Date().toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  await appendRevision({
    kind: "publish",
    content: draft,
    label: `Published ${stamp}`,
  });
  return draft;
}

/**
 * Restore a past revision to draft + live site.
 * Always appends a new revision entry — history is never deleted.
 */
export async function restoreRevision(id: string): Promise<SiteContent> {
  const { getRevision } = await import("./revisions");
  const revision = await getRevision(id);
  if (!revision) throw new Error("revision not found");

  const content = sanitizeContent(revision.content);
  await write(DRAFT_KEY, content);
  await write(PUBLISHED_KEY, content);

  const stamp = new Date().toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  await appendRevision({
    kind: "restore",
    content,
    restoredFromId: revision.id,
    label: `Restored ${stamp} ← ${revision.label}`,
  });

  return content;
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
