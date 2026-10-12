import type { Metadata } from "next";
import { BrandOverview } from "@/features/brand/brand-overview";

export const metadata: Metadata = { title: "Overview" };
export default function Page() {
  return <BrandOverview />;
}
