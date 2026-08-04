"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="w-full max-w-sm">
      <label
        htmlFor="password"
        className="text-ink-dim block text-[0.6rem] tracking-[0.34em]"
      >
        password
      </label>

      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        className="border-hairline focus:border-ember text-ink mt-3 w-full border-b bg-transparent pb-3 text-[1.15rem] tracking-[0.08em] outline-none transition-colors duration-500"
      />

      <div className="mt-8 flex items-center gap-5">
        <button
          type="submit"
          disabled={pending}
          className="text-ink hover:text-ember text-[1rem] tracking-[0.08em] transition-colors duration-500 disabled:opacity-40"
        >
          {pending ? "Checking…" : "Enter"}
        </button>
        <span aria-hidden className="bg-hairline h-px w-10" />
        <Link
          href="/"
          className="text-ink-faint hover:text-ink-dim text-[1rem] tracking-[0.08em] transition-colors duration-500"
        >
          Back to site
        </Link>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="text-ember/80 mt-6 h-4 text-[0.62rem] tracking-[0.2em]"
      >
        {state.error}
      </p>
    </form>
  );
}
