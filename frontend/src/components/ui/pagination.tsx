import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PageMeta } from "@/types/api";
import { Button } from "./button";

export function Pagination({ meta, onPage, label = "items" }: { meta: PageMeta; onPage: (page: number) => void; label?: string }) {
  if (meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-muted">
      <span className="tabular">
        {from}–{to} of {meta.total} {label}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onPage(meta.page - 1)} disabled={meta.page <= 1} aria-label="Previous page">
          <ChevronLeft /> Previous
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPage(meta.page + 1)} disabled={meta.page >= meta.totalPages} aria-label="Next page">
          Next <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
