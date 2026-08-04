"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasValidSession } from "@/lib/auth/session";
import { SECTION_LIMIT, type SiteContent } from "@/lib/content/schema";
import {
  discardDraft,
  getDraftContent,
  publishDraft,
  saveDraft,
} from "@/lib/content/store";

import type { AdminState } from "./state";

async function requireSession() {
  if (!(await hasValidSession())) redirect("/login");
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
