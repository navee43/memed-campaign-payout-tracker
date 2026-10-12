import type { Metadata } from "next";
import { CreatorEarnings } from "@/features/earnings/creator-earnings";

export const metadata: Metadata = { title: "Earnings" };
export default function Page() {
  return <CreatorEarnings />;
}
