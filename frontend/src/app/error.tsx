"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-4">
      <h1 className="font-display text-[56px]">Something broke on this page.</h1>
      <p className="text-muted">Nothing you did changed any money. Try again, and if it keeps happening, reload the page.</p>
      {error.digest && <p className="text-[13px] text-faint">Reference: {error.digest}</p>}
      <div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
