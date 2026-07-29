import { redirect } from "next/navigation";

import { hasValidSession, isAuthConfigured } from "@/lib/auth/session";

import { LoginForm } from "./login-form";

export const metadata = {
  title: "s.w. jafar — enter",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  if (await hasValidSession()) redirect("/admin");

  return (
    <main className="bg-void flex min-h-dvh items-center justify-center px-7">
      <div className="w-full max-w-sm">
        <p className="text-ink-faint text-[0.6rem] tracking-[0.34em]">
          int. the back office — night
        </p>
        <h1 className="text-ink mt-6 text-[0.8rem] tracking-[0.44em]">s.w. jafar</h1>
        <span aria-hidden className="bg-ink-faint mt-4 mb-10 block h-px w-5" />

        <LoginForm />

        {!isAuthConfigured() && (
          <p className="text-ink-faint mt-10 max-w-[42ch] text-[0.6rem] leading-relaxed tracking-[0.12em]">
            no password configured yet. set admin_password in the environment, then
            reload.
          </p>
        )}
      </div>
    </main>
  );
}
