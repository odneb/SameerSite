import { SceneStage } from "@/components/scene/scene-context";
import { SiteShell } from "@/components/site/site-shell";
import { getPublishedContent } from "@/lib/content/store";

export default async function HomePage() {
  const content = await getPublishedContent();

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <SceneStage
        plateUrl="/scene/hero-plate.jpg"
        // Baked from the room mesh by scripts/glb-bake.mjs, so the splats sit on
        // the scene's real geometry. Override with a different pass via the env
        // var, or a full capture at splatUrl to replace the field entirely.
        depthUrl={process.env.NEXT_PUBLIC_DEPTH_URL ?? "/scene/hero-depth.png"}
        splatUrl={process.env.NEXT_PUBLIC_SPLAT_URL ?? null}
        // The room itself, decimated by scripts/glb-mesh.mjs, standing behind the
        // cloud in the same space the depth pass put the splats in.
        roomUrl={process.env.NEXT_PUBLIC_ROOM_URL ?? "/scene/room.glb"}
      >
        <SiteShell content={content} />
      </SceneStage>
    </main>
  );
}
