import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLayout } from "@/features/auth/auth-layout";
import { RedirectIfSignedIn } from "@/features/auth/redirect-if-signed-in";
import { SignupForm } from "@/features/auth/signup-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthLayout title="Create your account" subtitle="Brands fund campaigns. Creators post and earn. It takes a minute either way.">
      <Suspense>
        <RedirectIfSignedIn />
        <SignupForm />
      </Suspense>
    </AuthLayout>
  );
}
