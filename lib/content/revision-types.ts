import type { SiteContent } from "./schema";

export type SiteRevision = {
  id: string;
  createdAt: string;
  kind: "publish" | "restore";
  label: string;
  restoredFromId?: string;
  content: SiteContent;
};
