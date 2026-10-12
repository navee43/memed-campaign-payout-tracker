import { AppShell } from "@/components/layout/app-shell";

export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="CREATOR">{children}</AppShell>;
}
