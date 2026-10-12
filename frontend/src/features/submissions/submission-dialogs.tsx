"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { formatINR, formatNumber, viewsInputToNumber } from "@/lib/format";
import { submissionService } from "@/services/submissions";
import type { Submission } from "@/types/api";

function useInvalidateSubmission(sub: Submission) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["submissions"] }),
      qc.invalidateQueries({ queryKey: ["submission", sub.id] }),
      qc.invalidateQueries({ queryKey: ["campaign", sub.campaignId] }),
      qc.invalidateQueries({ queryKey: ["campaigns"] }),
      qc.invalidateQueries({ queryKey: ["earnings"] }),
      qc.invalidateQueries({ queryKey: ["brand"] }),
    ]);
}

/**
 * Local/demo only: drives PATCH /submissions/:id/views, which the API accepts
 * without a service key only in simulation mode. In production the same
 * endpoint requires the trusted ingestion service credential.
 */
export function SimulateViewsDialog({ submission, open, onOpenChange }: { submission: Submission; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [text, setText] = useState(String(Math.max(submission.currentViews, submission.nextMilestone?.views ?? submission.currentViews)));
  const id = useId();
  const views = viewsInputToNumber(text);
  const invalidate = useInvalidateSubmission(submission);
  const m = useMutation({
    mutationFn: () => submissionService.simulateViews(submission.id, views!),
    onSuccess: async (r) => {
      await invalidate();
      if (r.outcome === "UNCHANGED") toast.info("No change — that’s already the current count.");
      else if (r.allocation.grantedPaise > 0)
        toast.success(`${formatINR(r.allocation.grantedPaise)} committed to this post`, {
          description: r.allocation.partial ? "The campaign budget ran out, so this post is only partly funded." : `Now at ${formatNumber(r.submission.currentViews)} views.`,
        });
      else toast.success(`Views updated to ${formatNumber(r.submission.currentViews)}`, { description: r.submission.fundingStatus === "UNFUNDED" ? "Milestone reached, but the budget is used up." : undefined });
      if (r.anomaly.newlyFlagged) toast.warning("View spike flagged for the brand to review", { description: r.anomaly.reason ?? undefined });
      onOpenChange(false);
    },
    onError: (err) => toast.error("View update rejected", { description: errorMessage(err) }),
  });
  const tooLow = views !== null && views < submission.currentViews;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Simulate a view update" description="Demo mode: stands in for the platform’s view feed. Real deployments ingest views from a trusted service.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (views !== null && !tooLow) m.mutate();
          }}
          className="flex flex-col gap-5"
        >
          <Field
            label="New total view count"
            htmlFor={id}
            error={views === null && text !== "" ? "Enter a whole number" : tooLow ? `Views only go up. Current count is ${formatNumber(submission.currentViews)}.` : undefined}
            hint={`Currently ${formatNumber(submission.currentViews)} views.`}
          >
            <Input id={id} inputMode="numeric" autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-invalid={views === null || tooLow} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending} disabled={views === null || tooLow}>
              Send update
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RejectDialog({ submission, open, onOpenChange }: { submission: Submission; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [reason, setReason] = useState("");
  const id = useId();
  const invalidate = useInvalidateSubmission(submission);
  const m = useMutation({
    mutationFn: () => submissionService.reject(submission.id, reason.trim()),
    onSuccess: async () => {
      await invalidate();
      toast.success("Submission rejected");
      onOpenChange(false);
    },
    onError: (err) => toast.error("Couldn’t reject", { description: errorMessage(err) }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Reject this post?" description="Use this for posts that don’t follow the brief. The creator sees your reason. Posts that have already earned can’t be rejected here.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 3) m.mutate();
          }}
          className="flex flex-col gap-5"
        >
          <Field label="Reason" htmlFor={id} hint="At least 3 characters.">
            <Textarea id={id} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Doesn’t mention the product" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={m.isPending} disabled={reason.trim().length < 3}>
              Reject post
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function useAcknowledgeAnomaly(submission: Submission) {
  const invalidate = useInvalidateSubmission(submission);
  return useMutation({
    mutationFn: () => submissionService.acknowledgeAnomaly(submission.id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Marked as reviewed");
    },
    onError: (err) => toast.error("Couldn’t update", { description: errorMessage(err) }),
  });
}
