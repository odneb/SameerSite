import type { Metadata, Viewport } from "next";

import { getPublishedContent } from "@/lib/content/store";
import "./globals.css";

function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublishedContent();
  return {
    metadataBase: new URL(siteUrl()),
    title: content.meta.title,
    description: content.meta.description,
    openGraph: {
      title: content.meta.title,
      description: content.meta.description,
      type: "website",
      images: ["/scene/hero-plate.jpg"],
    },
    twitter: {
      card: "summary_large_image",
      title: content.meta.title,
      description: content.meta.description,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#070603",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="bg-void text-ink min-h-full overflow-x-hidden antialiased">
        {children}
      </body>
    </html>
  );
}
