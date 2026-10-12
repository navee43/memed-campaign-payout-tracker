import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...p} className={cn("text-left", p.className)} />;
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} className={cn("[&_tr:last-child]:border-0", p.className)} />;
export const TR = (p: React.HTMLAttributes<HTMLTableRowElement>) => <tr {...p} className={cn("border-b border-line", p.className)} />;
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th scope="col" className={cn("whitespace-nowrap px-4 py-2.5 text-[12px] font-semibold text-muted first:pl-5 last:pr-5", className)} {...p} />
);
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn("px-4 py-3 align-middle first:pl-5 last:pr-5", className)} {...p} />;
