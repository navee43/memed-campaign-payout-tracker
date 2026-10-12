import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4">
      <Logo />
      <h1 className="font-display text-[64px]">This page didn’t hit its first milestone.</h1>
      <p className="text-muted">The link may be old, or the page may have moved.</p>
      <div>
        <Button asChild>
          <Link href="/">Go to the home page</Link>
        </Button>
      </div>
    </main>
  );
}
