import { Logo } from "@/components/layout/logo";
import { MilestoneLadder } from "@/components/domain/milestone-ladder";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,34rem)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-[44px]">{title}</h1>
          <p className="mt-2 text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </main>
      </div>
      <aside className="hidden flex-col justify-center bg-ink px-12 text-white lg:flex" aria-hidden>
        <p className="font-display text-[40px] leading-[1.02]">The highest milestone pays. The budget is the limit.</p>
        <div className="mt-10 rounded-xl bg-white p-6 text-ink">
          <MilestoneLadder
            milestones={[
              { views: 10_000, payoutPaise: 50_000 },
              { views: 50_000, payoutPaise: 2_00_000 },
              { views: 1_00_000, payoutPaise: 5_00_000 },
            ]}
            views={72_000}
          />
        </div>
      </aside>
    </div>
  );
}
