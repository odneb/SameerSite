import { PlainImageStage } from "@/components/scene/scene-context";
import { SiteShell } from "@/components/site/site-shell";
import { getPublishedContent } from "@/lib/content/store";

export default async function HomePageV2() {
  const content = await getPublishedContent();

  return (
    <main className="theme-v2 relative h-dvh w-full overflow-hidden">
      <PlainImageStage plateUrl="/scene/hero-plate.jpg">
        <SiteShell content={content} />
      </PlainImageStage>
    </main>
  );
}
