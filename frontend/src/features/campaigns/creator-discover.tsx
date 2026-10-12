"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Compass, Search } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounced } from "@/hooks/use-debounced";
import { campaignService } from "@/services/campaigns";
import type { Platform } from "@/types/api";
import { CampaignCard } from "./campaign-card";

type PlatformFilter = Platform | "all";
type PayoutFilter = "any" | "50000" | "200000" | "500000";

export function CreatorDiscover() {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [payout, setPayout] = useState<PayoutFilter>("any");
  const [sort, setSort] = useState<"newest" | "budget" | "payout">("newest");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search.trim());
  const query = {
    page,
    pageSize: 12,
    search: debounced || undefined,
    platform: platform === "all" ? undefined : platform,
    minPayoutPaise: payout === "any" ? undefined : Number(payout),
    minRemainingPaise: 1,
    sort,
  };
  const q = useQuery({ queryKey: ["campaigns", "discover", query], queryFn: () => campaignService.list(query), placeholderData: keepPreviousData });
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };
  const filtered = Boolean(debounced) || platform !== "all" || payout !== "any";

  return (
    <>
      <PageHeader title="Discover campaigns" description="Live campaigns with budget left. Post first, then submit your link." />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input value={search} onChange={(e) => reset(() => setSearch(e.target.value))} placeholder="Search campaigns" aria-label="Search campaigns by name" className="pl-9" />
        </div>
        <Select<PlatformFilter>
          aria-label="Platform"
          className="w-40"
          value={platform}
          onValueChange={(v) => reset(() => setPlatform(v))}
          options={[
            { value: "all", label: "All platforms" },
            { value: "INSTAGRAM", label: "Instagram" },
            { value: "YOUTUBE", label: "YouTube" },
          ]}
        />
        <Select<PayoutFilter>
          aria-label="Top payout"
          className="w-44"
          value={payout}
          onValueChange={(v) => reset(() => setPayout(v))}
          options={[
            { value: "any", label: "Any payout" },
            { value: "50000", label: "Pays ₹500+" },
            { value: "200000", label: "Pays ₹2,000+" },
            { value: "500000", label: "Pays ₹5,000+" },
          ]}
        />
        <Select<"newest" | "budget" | "payout">
          aria-label="Sort"
          className="w-44"
          value={sort}
          onValueChange={(v) => reset(() => setSort(v))}
          options={[
            { value: "newest", label: "Newest" },
            { value: "payout", label: "Highest payout" },
            { value: "budget", label: "Most budget left" },
          ]}
        />
      </div>

      {q.isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data && q.data.items.length === 0 ? (
        <EmptyState icon={filtered ? <Search /> : <Compass />} title={filtered ? "No campaigns match" : "No live campaigns right now"}>
          {filtered ? "Try another platform or a lower payout filter." : "New campaigns appear here the moment a brand publishes one. Check back soon."}
        </EmptyState>
      ) : q.data ? (
        <>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {q.data.items.map((c) => (
              <li key={c.id} className="flex">
                <CampaignCard campaign={c} />
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Pagination meta={q.data.meta} onPage={setPage} label="campaigns" />
          </div>
        </>
      ) : null}
    </>
  );
}
