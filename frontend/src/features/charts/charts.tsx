"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact, formatINR, formatNumber } from "@/lib/format";

/**
 * Chart tokens (validated with the dataviz palette checker against #ffffff):
 * money marks use a deeper marigold than the UI accent so bars stay visible on
 * white; views use indigo. Money marks are under 3:1 contrast, so every money
 * chart ships with a tooltip and a table elsewhere on the page.
 */
export const CHART = {
  money: "#E89A00",
  views: "#3A2FD3",
  remainder: "#D9D5EA",
  grid: "#ECEAF4",
  axis: "#5E5A78",
} as const;

const axisProps = { stroke: CHART.axis, tickLine: false, axisLine: false, fontSize: 12 } as const;

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string; format: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-[13px] shadow-pop">
      {label && <div className="mb-1 font-semibold">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span className="text-muted">{p.name}</span>
          <span className="tabular ml-auto pl-3 font-semibold">{format(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Single money series per day (no legend: the panel title names it). */
export function DailyMoneyChart({ data, name, height = 220 }: { data: { date: string; amountPaise: number }[]; name: string; height?: number }) {
  const rows = data.map((d) => ({ label: shortDate(d.date), value: d.amountPaise }));
  return (
    <div style={{ height }} role="img" aria-label={`${name} per day, bar chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={4}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="label" {...axisProps} minTickGap={16} />
          <YAxis {...axisProps} width={56} tickFormatter={(v: number) => `₹${formatCompact(v / 100)}`} />
          <Tooltip cursor={{ fill: CHART.grid }} content={<ChartTooltip format={formatINR} />} />
          <Bar dataKey="value" name={name} fill={CHART.money} radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Committed vs remaining per campaign — part-to-whole, horizontal stacked bars. */
export function BudgetSplitChart({ data }: { data: { name: string; committed: number; remaining: number }[] }) {
  const height = Math.max(120, data.length * 44 + 40);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-[13px] text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: CHART.money }} /> Committed to creators
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: CHART.remainder }} /> Remaining budget
        </span>
      </div>
      <div style={{ height }} role="img" aria-label="Committed and remaining budget per campaign, stacked bar chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap={14}>
            <CartesianGrid horizontal={false} stroke={CHART.grid} />
            <XAxis type="number" {...axisProps} tickFormatter={(v: number) => `₹${formatCompact(v / 100)}`} />
            <YAxis type="category" dataKey="name" {...axisProps} width={140} tick={{ fill: "#17123a", fontSize: 12 }} />
            <Tooltip cursor={{ fill: CHART.grid }} content={<ChartTooltip format={formatINR} />} />
            <Bar dataKey="committed" name="Committed" stackId="b" fill={CHART.money} maxBarSize={22} stroke="#fff" strokeWidth={2} />
            <Bar dataKey="remaining" name="Remaining" stackId="b" fill={CHART.remainder} maxBarSize={22} radius={[0, 4, 4, 0]} stroke="#fff" strokeWidth={2} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Submissions per highest milestone reached (single series). */
export function MilestoneDistributionChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <div style={{ height: 220 }} role="img" aria-label="Number of posts by highest milestone reached, bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="label" {...axisProps} interval={0} tick={{ fontSize: 11, fill: CHART.axis }} />
          <YAxis {...axisProps} allowDecimals={false} width={32} />
          <Tooltip cursor={{ fill: CHART.grid }} content={<ChartTooltip format={(n) => `${formatNumber(n)} posts`} />} />
          <Bar dataKey="count" name="Posts" fill={CHART.views} radius={[4, 4, 0, 0]} maxBarSize={24} label={{ position: "top", fontSize: 12, fill: "#17123a" }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Views over time with the milestone thresholds as reference lines. */
export function ViewsChart({ history, milestones }: { history: { views: number; observedAt: string }[]; milestones: { views: number; payoutPaise: number }[] }) {
  // Snapshots are stored in arrival order; plot them in the order they were observed.
  const sorted = [...history].sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
  const rows = sorted.map((h) => ({
    label: new Date(h.observedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
    views: h.views,
  }));
  const maxViews = Math.max(...history.map((h) => h.views), 1);
  const visible = milestones.filter((m) => m.views <= maxViews * 1.6);
  return (
    <div style={{ height: 260 }} role="img" aria-label="Views over time, line chart with milestone lines">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="label" {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} width={48} tickFormatter={(v: number) => formatCompact(v)} domain={[0, (dataMax: number) => Math.max(dataMax, visible.at(-1)?.views ?? 0) * 1.05]} />
          <Tooltip content={<ChartTooltip format={formatNumber} />} />
          {visible.map((m) => (
            <ReferenceLine
              key={m.views}
              y={m.views}
              stroke={CHART.money}
              strokeDasharray="4 4"
              label={{ value: `${formatCompact(m.views)} views: ${formatINR(m.payoutPaise)}`, position: "insideTopLeft", fontSize: 11, fill: "#17123a" }}
            />
          ))}
          <Line type="monotone" dataKey="views" name="Views" stroke={CHART.views} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: CHART.views }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
