import { AppShell } from "@/components/layout/app-shell";

export default function BrandLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="BRAND">{children}</AppShell>;
}
