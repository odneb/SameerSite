import { FilmGrade } from "@/components/grade/film-grade";
import { PlainImageStage } from "@/components/scene/scene-context";
import { SiteShell } from "@/components/site/site-shell";
import { ThemeVars } from "@/components/site/theme-vars";
import { getPublishedContent } from "@/lib/content/store";

export default async function HomePage() {
  const content = await getPublishedContent();

  return (
    <main className="theme-v2 relative h-dvh w-full overflow-hidden">
      <ThemeVars theme={content.theme} />
      <FilmGrade>
        <PlainImageStage plateUrl="/scene/hero-plate.jpg">
          <SiteShell content={content} />
        </PlainImageStage>
      </FilmGrade>
    </main>
  );
}
