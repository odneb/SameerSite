import { redirect } from "next/navigation";

/** /v2 is now the site home. */
export default function HomePageV2Redirect() {
  redirect("/");
}
