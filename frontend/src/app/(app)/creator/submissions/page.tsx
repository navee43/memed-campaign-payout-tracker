import type { Metadata } from "next";
import { CreatorSubmissions } from "@/features/submissions/creator-submissions";

export const metadata: Metadata = { title: "My posts" };
export default function Page() {
  return <CreatorSubmissions />;
}
