import type { Metadata } from "next";
import { EditDraft } from "@/features/campaigns/edit-draft";

export const metadata: Metadata = { title: "Edit draft" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditDraft id={id} />;
}
