import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLayout } from "@/features/auth/auth-layout";
import { LoginForm } from "@/features/auth/login-form";
import { RedirectIfSignedIn } from "@/features/auth/redirect-if-signed-in";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <AuthLayout title="Sign in" subtitle="Pick up where you left off: campaigns, posts and earnings.">
      <Suspense>
        <RedirectIfSignedIn />
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
