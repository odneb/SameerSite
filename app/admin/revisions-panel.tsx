"use client";

import { useActionState, useState } from "react";

import type { SiteRevision } from "@/lib/content/revision-types";

import { restoreRevisionAction } from "./actions";
import { initialRestoreState } from "./state";

export function RevisionsPanel({ revisions }: { revisions: SiteRevision[] }) {
  const [state, formAction, pending] = useActionState(
    restoreRevisionAction,
    initialRestoreState,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <section className="space-y-5">
      <p className="text-ink-dim text-[0.8rem] leading-relaxed">
        Every publish is kept forever. Restoring brings that version back live and
        adds a new log entry — nothing is deleted. You must type the admin password
        to restore.
      </p>

      {state.message && (
        <p
          role="status"
          className={`text-[0.85rem] ${state.status === "error" ? "text-ember" : "text-ink"}`}
        >
          {state.message}
        </p>
      )}

      {revisions.length === 0 ? (
        <p className="text-ink-faint text-[0.8rem]">
          No revisions yet. Press Publish once to start the log.
        </p>
      ) : (
        <ul className="space-y-3">
          {revisions.map((revision) => {
            const open = selectedId === revision.id;
            const when = new Date(revision.createdAt).toLocaleString("en-CA", {
              dateStyle: "medium",
              timeStyle: "short",
            });
            return (
              <li
                key={revision.id}
                className="border-hairline rounded-lg border bg-white/[0.02] px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-ink text-[0.85rem] font-semibold">{revision.label}</p>
                    <p className="text-ink-faint mt-1 text-[0.72rem]">
                      {when}
                      {" · "}
                      {revision.kind === "restore" ? "restore" : "publish"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(open ? null : revision.id)}
                    className="text-ember text-[0.8rem] font-semibold underline-offset-4 hover:underline"
                  >
                    {open ? "Cancel" : "Restore this version"}
                  </button>
                </div>

                {open && (
                  <form action={formAction} className="border-hairline mt-4 space-y-3 border-t pt-4">
                    <input type="hidden" name="revisionId" value={revision.id} />
                    <label className="text-ink block text-[0.8rem] font-semibold">
                      Type the admin password to confirm
                      <input
                        type="password"
                        name="password"
                        required
                        autoComplete="current-password"
                        className="border-hairline focus:border-ember text-ink mt-1.5 w-full rounded-md border bg-white/[0.03] px-3 py-2 text-[0.92rem] outline-none"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={pending}
                      className="bg-ember text-void hover:bg-ink min-h-10 rounded-lg px-4 text-[0.85rem] font-semibold disabled:opacity-40"
                    >
                      {pending ? "Restoring…" : "Confirm restore"}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
