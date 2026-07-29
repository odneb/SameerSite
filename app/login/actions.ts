"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { attemptLogin, destroySession } from "@/lib/auth/session";

export type LoginState = { error: string | null };

/** Requests are keyed by client IP so one visitor's failures can't lock out others. */
async function rateLimitKey() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local";
}

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const result = await attemptLogin(password, await rateLimitKey());

  if (result.ok) redirect("/admin");

  if (result.reason === "unconfigured") {
    return { error: "no password is set. add admin_password to the environment." };
  }
  if (result.reason === "rate-limited") {
    return { error: `too many attempts. try again in ${result.retryInSeconds}s.` };
  }
  return { error: "that isn't it." };
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
