"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasValidSession, verifyAdminPassword } from "@/lib/auth/session";
import { SECTION_LIMIT, type SiteContent } from "@/lib/content/schema";
import { sanitizeTheme } from "@/lib/content/theme";
import {
  discardDraft,
  getDraftContent,
  publishDraft,
  restoreRevision,
  saveDraft,
} from "@/lib/content/store";

import type { AdminState } from "./state";

async function requireSession() {
  if (!(await hasValidSession())) redirect("/login");
}

async function rateLimitKey() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local";
}

/** Rebuild the content object from flat form fields. */
function contentFromFormData(formData: FormData, previous: SiteContent) {
  const value = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" ? raw : "";
  };

  const sections = [];
  for (let index = 0; index < SECTION_LIMIT; index++) {
    if (!formData.has(`section.${index}.script`)) break;
    const prior = previous.sections[index];
    sections.push({
      id: value(`section.${index}.id`),
      number: String(index + 1).padStart(2, "0"),
      label: value(`section.${index}.label`),
      script: value(`section.${index}.script`),
      ...(prior?.portrait ? { portrait: prior.portrait } : {}),
      focus: {
        u: Number(value(`section.${index}.u`)),
        v: Number(value(`section.${index}.v`)),
      },
    });
  }

  const theme = sanitizeTheme({
    void: value("theme.void"),
    ink: value("theme.ink"),
    inkDim: value("theme.inkDim"),
    ember: value("theme.ember"),
    canvas: value("theme.canvas"),
    sage: value("theme.sage"),
    scale: Number(value("theme.scale")),
    brandSize: Number(value("theme.brandSize")),
    roleSize: Number(value("theme.roleSize")),
    quoteSize: Number(value("theme.quoteSize")),
    navSize: Number(value("theme.navSize")),
    bodySize: Number(value("theme.bodySize")),
  });

  return {
    meta: { title: value("meta.title"), description: value("meta.description") },
    brand: {
      name: value("brand.name"),
      role: value("brand.role"),
      mark: value("brand.mark"),
    },
    hero: { quote: value("hero.quote"), attribution: value("hero.attribution") },
    sections,
    footer: { copyright: value("footer.copyright") },
    theme,
  };
}

export async function submitAction(
  _previous: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireSession();

  const publishing = formData.get("intent") === "publish";

  try {
    const previous = await getDraftContent();
    await saveDraft(contentFromFormData(formData, previous));
    if (publishing) await publishDraft();
  } catch {
    return {
      status: "error",
      message: "Could not save. Please try again in a moment.",
      at: Date.now(),
    };
  }

  revalidatePath("/preview");
  revalidatePath("/admin");
  if (publishing) revalidatePath("/");

  return {
    status: publishing ? "published" : "saved",
    message: publishing
      ? "Published. Your live website is updated."
      : "Saved. Press Publish when you want this on the live site.",
    at: Date.now(),
  };
}

export async function discardAction() {
  await requireSession();
  await discardDraft();
  revalidatePath("/admin");
  revalidatePath("/preview");
  redirect("/admin");
}

export type RestoreState = {
  status: "idle" | "ok" | "error";
  message: string | null;
  at: number;
};

export const initialRestoreState: RestoreState = {
  status: "idle",
  message: null,
  at: 0,
};

/** Restore a past revision — requires the admin password again. */
export async function restoreRevisionAction(
  _previous: RestoreState,
  formData: FormData,
): Promise<RestoreState> {
  await requireSession();

  const id = String(formData.get("revisionId") ?? "");
  const password = String(formData.get("password") ?? "");

  const auth = verifyAdminPassword(password, await rateLimitKey());
  if (!auth.ok) {
    if (auth.reason === "rate-limited") {
      return {
        status: "error",
        message: `Too many tries. Wait ${auth.retryInSeconds}s.`,
        at: Date.now(),
      };
    }
    return {
      status: "error",
      message: "Password incorrect. Nothing was changed.",
      at: Date.now(),
    };
  }

  try {
    await restoreRevision(id);
  } catch {
    return {
      status: "error",
      message: "Could not restore that revision.",
      at: Date.now(),
    };
  }

  revalidatePath("/");
  revalidatePath("/preview");
  revalidatePath("/admin");

  return {
    status: "ok",
    message: "Restored. Live site updated. This restore was also saved in the log.",
    at: Date.now(),
  };
}
