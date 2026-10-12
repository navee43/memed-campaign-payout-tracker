import type { Metadata } from "next";

// Signed-in areas are personal: keep them out of search indexes.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
