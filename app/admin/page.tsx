import Link from "next/link";
import { redirect } from "next/navigation";

import { hasValidSession } from "@/lib/auth/session";
import { getDraftContent, hasUnpublishedChanges } from "@/lib/content/store";

import { logoutAction } from "../login/actions";
import { AdminForm } from "./admin-form";
import { discardAction } from "./actions";

export const metadata = {
  title: "s.w. jafar — the back office",
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
      <div className="mx-auto max-w-3xl px-7 pt-16 md:px-10">
        <header className="border-hairline flex flex-wrap items-end justify-between gap-6 border-b pb-8">
          <div>
            <p className="text-ink-faint text-[0.58rem] tracking-[0.34em]">
              int. the back office — night
            </p>
            <h1 className="text-ink mt-4 text-[0.78rem] tracking-[0.44em]">
              the site, editable
            </h1>
          </div>

          <div className="flex items-center gap-6 text-[0.58rem] tracking-[0.3em]">
            <Link
              href="/"
              className="text-ink-faint hover:text-ink-dim transition-colors duration-500"
            >
              view live
            </Link>
            <form action={discardAction}>
              <button
                type="submit"
                className="text-ink-faint hover:text-ember transition-colors duration-500"
              >
                discard draft
              </button>
            </form>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-ink-faint hover:text-ink-dim transition-colors duration-500"
              >
                sign out
              </button>
            </form>
          </div>
        </header>

        <p className="text-ink-faint mt-8 max-w-[54ch] text-[0.6rem] leading-relaxed tracking-[0.14em]">
          edit anything below. save a draft as often as you like — nothing changes on
          the live site until you press publish.
        </p>

        <div className="mt-14">
          <AdminForm content={content} unpublished={unpublished} />
        </div>
      </div>
    </main>
  );
}
