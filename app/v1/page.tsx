import { SceneStage } from "@/components/scene/scene-context";
import { SiteShell } from "@/components/site/site-shell";
import { getPublishedContent } from "@/lib/content/store";

/** Previous splat / room hero — kept for reference. */
export default async function HomePageV1() {
  const content = await getPublishedContent();

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
    </main>
  );
}
