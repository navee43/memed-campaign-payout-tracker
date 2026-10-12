"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { formatINR, rupeesInputToPaise } from "@/lib/format";
import { campaignService } from "@/services/campaigns";
import type { Campaign } from "@/types/api";
import { toLocalInput } from "./campaign-form-schema";

function useInvalidateCampaign(id: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["campaign", id] }),
      qc.invalidateQueries({ queryKey: ["campaigns"] }),
      qc.invalidateQueries({ queryKey: ["brand"] }),
      qc.invalidateQueries({ queryKey: ["submissions", "campaign", id] }),
    ]);
}

export function TopUpDialog({ campaign, open, onOpenChange }: { campaign: Campaign; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [amount, setAmount] = useState("");
  const id = useId();
  const paise = rupeesInputToPaise(amount);
  const invalidate = useInvalidateCampaign(campaign.id);
  const m = useMutation({
    mutationFn: () => campaignService.topUp(campaign.id, paise!),
    onSuccess: async (res) => {
      await invalidate();
      const r = res.reconciliation;
      toast.success(`Budget topped up by ${formatINR(paise!)}`, {
        description:
          r.allocatedPaise > 0
            ? `${formatINR(r.allocatedPaise)} went straight to ${r.submissionsFunded} post${r.submissionsFunded === 1 ? "" : "s"} waiting for budget, oldest first.`
            : "No posts were waiting for budget.",
      });
      setAmount("");
      onOpenChange(false);
    },
    onError: (err) => toast.error("Top-up failed", { description: errorMessage(err) }),
  });
  const invalid = amount !== "" && (paise === null || paise <= 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Top up budget" description="Budgets can grow but never shrink once creators can earn against them.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (paise && paise > 0) m.mutate();
          }}
          className="flex flex-col gap-5"
        >
          <Field label="Amount to add (₹)" htmlFor={id} error={invalid ? "Enter an amount like 5000 or 2500.50" : undefined} hint={`Current budget ${formatINR(campaign.budget.budgetPaise)}, ${formatINR(campaign.budget.remainingPaise)} left.`}>
            <Input id={id} inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" aria-invalid={invalid} />
          </Field>
          <p className="text-sm text-muted">Posts that were only partly funded are paid from the new money first, in the order they ran short.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={!paise || paise <= 0}>
              Add {paise && paise > 0 ? formatINR(paise) : "funds"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "primary",
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const detailsSchema = z.object({
  name: z.string().trim().min(3, "Use at least 3 characters").max(100),
  description: z.string().trim().max(2000),
  endsAt: z.string(),
});

/** Editing a published campaign: only presentation fields and the submission deadline. */
export function EditDetailsDialog({ campaign, open, onOpenChange }: { campaign: Campaign; open: boolean; onOpenChange: (o: boolean) => void }) {
  const ids = { name: useId(), desc: useId(), end: useId() };
  const invalidate = useInvalidateCampaign(campaign.id);
  const form = useForm<z.infer<typeof detailsSchema>>({
    resolver: zodResolver(detailsSchema),
    values: { name: campaign.name, description: campaign.description, endsAt: toLocalInput(campaign.endsAt) },
  });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof detailsSchema>) =>
      campaignService.update(campaign.id, { name: v.name, description: v.description, endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : null }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Campaign updated");
      onOpenChange(false);
    },
    onError: (err) => toast.error("Couldn’t update the campaign", { description: errorMessage(err) }),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit details" description="Budget, platform and milestones are locked after publishing.">
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="flex flex-col gap-5" noValidate>
          <Field label="Name" htmlFor={ids.name} error={e.name?.message}>
            <Input id={ids.name} aria-invalid={!!e.name} {...form.register("name")} />
          </Field>
          <Field label="Brief" htmlFor={ids.desc} error={e.description?.message}>
            <Textarea id={ids.desc} rows={5} {...form.register("description")} />
          </Field>
          <Field label="Submissions close" htmlFor={ids.end} hint="Leave empty for no deadline." error={e.endsAt?.message}>
            <Input id={ids.end} type="datetime-local" {...form.register("endsAt")} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
