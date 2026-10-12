import { BadgeCheck, Ban, BookOpenCheck, Eye, Lock, ScrollText, Search, Target, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { CampaignCover } from "@/components/domain/campaign-cover";
import { PlatformTag } from "@/components/domain/platform";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { LadderDemo } from "@/features/landing/ladder-demo";
import { formatINR, formatNumber } from "@/lib/format";
import type { Milestone, Platform } from "@/types/api";

/* Clearly labelled examples for the landing page — invented brands, not live data. */
const EXAMPLES: { brand: string; name: string; platform: Platform; theme: number; budgetPaise: number; ladder: Milestone[] }[] = [
  {
    brand: "Kadak Chai Co. (example)",
    name: "Monsoon chai cravings",
    platform: "INSTAGRAM",
    theme: 1,
    budgetPaise: 25_000_00,
    ladder: [
      { views: 10_000, payoutPaise: 500_00 },
      { views: 50_000, payoutPaise: 2_000_00 },
      { views: 1_00_000, payoutPaise: 5_000_00 },
    ],
  },
  {
    brand: "Byte Runner (example)",
    name: "Sneaker drop edits",
    platform: "YOUTUBE",
    theme: 0,
    budgetPaise: 60_000_00,
    ladder: [
      { views: 25_000, payoutPaise: 1_000_00 },
      { views: 1_00_000, payoutPaise: 4_000_00 },
      { views: 5_00_000, payoutPaise: 12_000_00 },
    ],
  },
  {
    brand: "Exam Mode App (example)",
    name: "Board-exam week memes",
    platform: "INSTAGRAM",
    theme: 2,
    budgetPaise: 15_000_00,
    ladder: [
      { views: 20_000, payoutPaise: 750_00 },
      { views: 75_000, payoutPaise: 2_500_00 },
    ],
  },
];

const STEPS = [
  { title: "A brand sets the rules", body: "Pick Instagram or YouTube, set a total budget in rupees and a ladder of view milestones with a payout for each." },
  { title: "Creators post and submit the link", body: "Meme pages and clip accounts browse live campaigns, publish their post, then paste the link into Meme’d." },
  { title: "Views are tracked", body: "View counts only move forward. Each time a post crosses a milestone, its payout is recalculated from the ladder." },
  { title: "The highest milestone pays", body: "65K views on a 10K / 50K / 1L ladder earns the 50K payout. Money is reserved from the budget the moment it’s earned." },
];

export default function LandingPage() {
  return (
    <div className="bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm font-semibold text-muted md:flex">
          <a href="#how" className="hover:text-ink">
            How payouts work
          </a>
          <a href="#brands" className="hover:text-ink">
            For brands
          </a>
          <a href="#creators" className="hover:text-ink">
            For creators
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="ink" size="sm">
            <Link href="/signup">Create account</Link>
          </Button>
        </div>
      </header>

      <main>
        {/* Hero: the payout rule itself, as a live demo. */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <h1 className="font-display text-[56px] sm:text-[80px] lg:text-[92px]">Your post hits 50K views. You get ₹2,000.</h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              Meme’d runs brand campaigns for meme pages and clip accounts. Brands fund a budget and set view milestones. Creators earn the payout for the highest
              milestone their post reaches — and a campaign never spends past its budget.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup?role=BRAND">Launch a campaign</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/signup?role=CREATOR">Find paid campaigns</Link>
              </Button>
            </div>
          </div>
          <LadderDemo />
        </section>

        <section aria-labelledby="examples" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="examples" className="font-display text-[44px]">
                What a campaign looks like
              </h2>
              <p className="max-w-sm text-sm text-muted">These are illustrative examples with made-up brands. Live campaigns appear once you sign in as a creator.</p>
            </div>
            <ul className="mt-8 grid gap-5 md:grid-cols-3">
              {EXAMPLES.map((c) => (
                <li key={c.name} className="overflow-hidden rounded-lg border border-line bg-paper">
                  <CampaignCover theme={c.theme} name={c.name} className="h-24" />
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      <PlatformTag platform={c.platform} />
                      <span className="text-[12px] font-semibold text-muted">Example</span>
                    </div>
                    <h3 className="mt-2 text-xl font-bold">{c.name}</h3>
                    <p className="text-sm text-muted">{c.brand}</p>
                    <ol className="mt-4 flex flex-col gap-1.5 text-sm">
                      {c.ladder.map((m) => (
                        <li key={m.views} className="flex items-center justify-between gap-3">
                          <span className="tabular text-muted">{formatNumber(m.views)} views</span>
                          <span className="tabular font-bold">{formatINR(m.payoutPaise)}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="tabular mt-4 border-t border-line pt-3 text-[13px] text-muted">Budget {formatINR(c.budgetPaise)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-8">
          <h2 id="how-title" className="font-display text-[44px]">
            How payouts work
          </h2>
          <ol className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative border-t-2 border-ink pt-5">
                <span className="font-display text-5xl text-indigo" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-[15px] text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-ink text-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-8 md:grid-cols-2">
            <div id="brands">
              <h2 className="font-display text-[44px]">For brands</h2>
              <ul className="mt-6 flex flex-col gap-5">
                <Feature icon={<Target />} title="Pay for reach, not promises">
                  Set exactly what 10K, 50K or 1L views is worth to you. Nothing is owed until a milestone is reached.
                </Feature>
                <Feature icon={<Lock />} title="A budget that can’t be overspent">
                  Allocations are reserved atomically in the database, so even simultaneous view updates can’t push a campaign past its budget.
                </Feature>
                <Feature icon={<Eye />} title="Every post in one place">
                  See submissions, current views, the milestone each post reached and what it has earned. Unusual view spikes are flagged for review.
                </Feature>
              </ul>
            </div>
            <div id="creators">
              <h2 className="font-display text-[44px]">For creators</h2>
              <ul className="mt-6 flex flex-col gap-5">
                <Feature icon={<Search />} title="Find campaigns that fit your page">
                  Filter live campaigns by platform and payout, and see how much budget is left before you post.
                </Feature>
                <Feature icon={<TrendingUp />} title="Always know your next milestone">
                  Each post shows its views, the milestone it reached and how far the next payout is.
                </Feature>
                <Feature icon={<Wallet />} title="Earnings you can check">
                  Your dashboard shows what you’re eligible for, what’s been reserved for you and what’s been paid — never rounded up or guessed.
                </Feature>
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="trust" className="mx-auto max-w-6xl px-4 py-20 sm:px-8">
          <h2 id="trust" className="font-display max-w-2xl text-[44px]">
            Every rupee has a receipt
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <Trust icon={<ScrollText />} title="Append-only payout ledger">
              Each allocation is written once with the views, milestone and budget at that moment. Brands can audit every entry.
            </Trust>
            <Trust icon={<BookOpenCheck />} title="Earned, reserved and paid are different words">
              We show eligible earnings, amounts reserved from the budget, and actual bank payouts separately. Bank payouts aren’t connected yet, so that number is
              honestly ₹0.
            </Trust>
            <Trust icon={<Ban />} title="Views never go backwards">
              Old or lower view snapshots are ignored, so earnings can’t be reversed by a stale update.
            </Trust>
            <Trust icon={<BadgeCheck />} title="Flags are for review, not punishment">
              Our spike detector is a heuristic and can be wrong. A flag asks the brand to take a look; it never deletes a post or blocks earned money.
            </Trust>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-6 rounded-xl bg-marigold px-6 py-10 sm:px-10 md:flex-row md:items-center">
            <h2 className="font-display max-w-xl text-[40px] sm:text-[52px]">Start with one campaign. Pay only for the views you get.</h2>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" variant="ink">
                <Link href="/signup?role=BRAND">Launch a campaign</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-ink bg-transparent hover:bg-white/40">
                <Link href="/signup?role=CREATOR">Join as a creator</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-8 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-[13px] text-muted">
              Milestone payouts for creator campaigns. Instagram and YouTube are trademarks of their respective owners; Meme’d is not affiliated with them.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:gap-x-16">
            <a href="#how" className="text-muted hover:text-ink">
              How payouts work
            </a>
            <Link href="/signup?role=BRAND" className="text-muted hover:text-ink">
              Launch a campaign
            </Link>
            <a href="#brands" className="text-muted hover:text-ink">
              For brands
            </a>
            <Link href="/signup?role=CREATOR" className="text-muted hover:text-ink">
              Join as a creator
            </Link>
            <a href="#creators" className="text-muted hover:text-ink">
              For creators
            </a>
            <Link href="/login" className="text-muted hover:text-ink">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-white/10 text-marigold [&_svg]:size-5" aria-hidden>
        {icon}
      </span>
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="mt-1 text-[15px] text-white/70">{children}</p>
      </div>
    </li>
  );
}

function Trust({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink [&_svg]:size-5" aria-hidden>
        {icon}
      </span>
      <div>
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="mt-1 text-[15px] text-muted">{children}</p>
      </div>
    </div>
  );
}
