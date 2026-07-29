import { SceneStage } from "@/components/scene/scene-context";
import { SiteShell } from "@/components/site/site-shell";
import { getPublishedContent } from "@/lib/content/store";

export default async function HomePage() {
  const content = await getPublishedContent();

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <SceneStage
        plateUrl="/scene/hero-plate.jpg"
        // Drop a grayscale depth pass here (white = near) to replace the
        // authored depth regions, or a real capture at splatUrl to replace the
        // plate-derived field entirely.
        depthUrl={process.env.NEXT_PUBLIC_DEPTH_URL ?? null}
        splatUrl={process.env.NEXT_PUBLIC_SPLAT_URL ?? null}
      >
        <SiteShell content={content} />
      </SceneStage>
    </main>
  );
}
