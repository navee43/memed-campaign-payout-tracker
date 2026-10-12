import type { Metadata } from "next";
import { CreatorDiscover } from "@/features/campaigns/creator-discover";

export const metadata: Metadata = { title: "Discover campaigns" };
export default function Page() {
  return <CreatorDiscover />;
}
