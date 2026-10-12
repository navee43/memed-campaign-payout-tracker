import type { Metadata } from "next";
import { SubmissionDetailView } from "@/features/submissions/submission-detail";

export const metadata: Metadata = { title: "Post" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubmissionDetailView id={id} viewer="CREATOR" />;
}
