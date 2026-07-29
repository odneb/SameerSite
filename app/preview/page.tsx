import { redirect } from "next/navigation";

import { SceneStage } from "@/components/scene/scene-context";
import { SiteShell } from "@/components/site/site-shell";
import { hasValidSession } from "@/lib/auth/session";
import { getDraftContent } from "@/lib/content/store";

export const metadata = {
  title: "s.w. jafar — draft",
  robots: { index: false, follow: false },
};

/** The unpublished draft, exactly as the live site would render it. */
export default async function PreviewPage() {
  if (!(await hasValidSession())) redirect("/login");
  const content = await getDraftContent();

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <SceneStage
        plateUrl="/scene/hero-plate.jpg"
        depthUrl={process.env.NEXT_PUBLIC_DEPTH_URL ?? "/scene/hero-depth.png"}
        splatUrl={process.env.NEXT_PUBLIC_SPLAT_URL ?? null}
        roomUrl={process.env.NEXT_PUBLIC_ROOM_URL ?? "/scene/room.glb"}
      >
        <SiteShell content={content} />
      </SceneStage>

      <p className="text-ember/70 fixed top-1/2 right-0 z-40 origin-bottom-right -rotate-90 text-[0.54rem] tracking-[0.4em]">
        draft — not live
      </p>
    </main>
  );
}
