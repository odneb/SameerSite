import Link from "next/link";
import { redirect } from "next/navigation";

import { hasValidSession } from "@/lib/auth/session";
import { appendRevision, listRevisions } from "@/lib/content/revisions";
import {
  getDraftContent,
  getPublishedContent,
  hasUnpublishedChanges,
} from "@/lib/content/store";

import { logoutAction } from "../login/actions";
import { AdminForm } from "./admin-form";
import { discardAction } from "./actions";

export const metadata = {
  title: "Edit website — sameer jafar",
  robots: { index: false, follow: false },
};

/** If the log is empty, snapshot the current live site as the starting point. */
async function ensureBaselineRevision() {
  try {
    const existing = await listRevisions();
    if (existing.length > 0) return existing;
    const published = await getPublishedContent();
    await appendRevision({
      kind: "publish",
      content: published,
      label: "Starting point",
    });
    return listRevisions();
  } catch {
    // Fresh Vercel deploys without Blob can't write .data/ — don't take down /admin.
    return [];
  }
}

export default async function AdminPage() {
  if (!(await hasValidSession())) redirect("/login");

  const [content, unpublished, revisions] = await Promise.all([
    getDraftContent(),
    hasUnpublishedChanges(),
    ensureBaselineRevision(),
  ]);

  return (
    <main className="bg-void min-h-dvh">
      <div className="mx-auto max-w-2xl px-5 pt-8 pb-28 sm:px-8">
        <header className="border-hairline flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div>
            <h1 className="text-ink text-[1.15rem] font-semibold tracking-[0.06em]">
              Edit your website
            </h1>
            <p className="text-ink-dim mt-2 text-[0.82rem] leading-relaxed">
              Choose what to edit → change it → Save → Publish when ready
            </p>
          </div>

          <div className="flex items-center gap-4 text-[0.8rem]">
            <Link
              href="/"
              className="text-ink-dim hover:text-ink underline-offset-4 transition-colors hover:underline"
            >
              View live site
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-ink-dim hover:text-ink underline-offset-4 transition-colors hover:underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <div className="mt-8">
          <AdminForm
            content={content}
            unpublished={unpublished}
            revisions={revisions}
          />
        </div>

        <details className="border-hairline mt-10 rounded-lg border px-4 py-3">
          <summary className="text-ink-dim cursor-pointer text-[0.8rem]">
            Advanced: discard draft
          </summary>
          <form action={discardAction} className="mt-3">
            <button
              type="submit"
              className="text-ember text-[0.8rem] underline-offset-4 hover:underline"
            >
              Discard draft and reload live copy
            </button>
          </form>
        </details>
      </div>
    </main>
  );
}
