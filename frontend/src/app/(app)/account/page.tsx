import type { Metadata } from "next";
import { AccountPage } from "@/features/account/account-page";

export const metadata: Metadata = { title: "Account" };
export default function Page() {
  return <AccountPage />;
}
