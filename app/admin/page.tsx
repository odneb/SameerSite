import Link from "next/link";
import { redirect } from "next/navigation";

import { hasValidSession } from "@/lib/auth/session";
import { getDraftContent, hasUnpublishedChanges } from "@/lib/content/store";

import { logoutAction } from "../login/actions";
import { AdminForm } from "./admin-form";
import { discardAction } from "./actions";

export const metadata = {
  title: "Edit website — sameer jafar",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  if (!(await hasValidSession())) redirect("/login");

  const [content, unpublished] = await Promise.all([
    getDraftContent(),
    hasUnpublishedChanges(),
  ]);

  return (
    <main className="bg-void min-h-dvh overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 pt-10 pb-8 sm:px-10">
        <header className="border-hairline flex flex-wrap items-start justify-between gap-6 border-b pb-8">
          <div>
            <h1 className="text-ink text-[1.6rem] font-semibold tracking-[0.04em]">
              Edit your website
            </h1>
            <p className="text-ink-dim mt-3 max-w-[40ch] text-[1.05rem] leading-relaxed">
              1) Choose what to edit &nbsp; 2) Change the words &nbsp; 3) Save &nbsp; 4)
              Publish when you want it live
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-[1rem]">
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

        <div className="mt-10">
          <AdminForm content={content} unpublished={unpublished} />
        </div>

        <details className="border-hairline mt-16 mb-8 rounded-xl border px-5 py-4">
          <summary className="text-ink-dim cursor-pointer text-[1rem]">
            Advanced: throw away unsaved draft and reload the live site
          </summary>
          <form action={discardAction} className="mt-4">
            <button
              type="submit"
              className="text-ember text-[1rem] underline-offset-4 hover:underline"
            >
              Discard draft and reload live copy
            </button>
          </form>
        </details>
      </div>
    </main>
  );
}
