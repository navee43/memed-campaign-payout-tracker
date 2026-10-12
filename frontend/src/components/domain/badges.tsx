import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Hourglass, PauseCircle, Radio, ShieldCheck } from "lucide-react";
import { Badge } from "../ui/badge";
import type { CampaignStatus, FundingStatus, Submission } from "@/types/api";

const STATUS: Record<CampaignStatus, { label: string; tone: "neutral" | "success" | "warn" | "ink"; icon: React.ReactNode }> = {
  DRAFT: { label: "Draft", tone: "neutral", icon: <CircleDashed /> },
  LIVE: { label: "Live", tone: "success", icon: <Radio /> },
  PAUSED: { label: "Paused", tone: "warn", icon: <PauseCircle /> },
  COMPLETED: { label: "Completed", tone: "ink", icon: <CheckCircle2 /> },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone}>
      {s.icon}
      {s.label}
    </Badge>
  );
}

export const FUNDING_LABEL: Record<FundingStatus, string> = {
  NOT_ELIGIBLE: "No milestone yet",
  FULLY_FUNDED: "Fully funded",
  PARTIALLY_FUNDED: "Partly funded",
  UNFUNDED: "Awaiting budget",
};

export function FundingBadge({ status }: { status: FundingStatus }) {
  const map: Record<FundingStatus, { tone: "neutral" | "success" | "warn" | "danger"; icon: React.ReactNode }> = {
    NOT_ELIGIBLE: { tone: "neutral", icon: <CircleDashed /> },
    FULLY_FUNDED: { tone: "success", icon: <CheckCircle2 /> },
    PARTIALLY_FUNDED: { tone: "warn", icon: <Hourglass /> },
    UNFUNDED: { tone: "danger", icon: <CircleSlash /> },
  };
  const m = map[status];
  return (
    <Badge tone={m.tone}>
      {m.icon}
      {FUNDING_LABEL[status]}
    </Badge>
  );
}

export function AnomalyBadge({ anomaly }: { anomaly: Submission["anomaly"] }) {
  if (!anomaly.flagged) return null;
  return anomaly.reviewedAt ? (
    <Badge tone="neutral" title={anomaly.reason ?? undefined}>
      <ShieldCheck /> Spike reviewed
    </Badge>
  ) : (
    <Badge tone="danger" title={anomaly.reason ?? undefined}>
      <AlertTriangle /> View spike
    </Badge>
  );
}
