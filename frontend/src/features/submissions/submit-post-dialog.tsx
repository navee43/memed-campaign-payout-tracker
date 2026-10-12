"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { PLATFORM_LABEL } from "@/components/domain/platform";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { ApiError, errorMessage } from "@/lib/api";
import { campaignService } from "@/services/campaigns";
import type { Campaign } from "@/types/api";

const EXAMPLES = {
  INSTAGRAM: "https://www.instagram.com/reel/AbC123xYz/",
  YOUTUBE: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
} as const;

export function SubmitPostDialog({ campaign, open, onOpenChange }: { campaign: Campaign; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const qc = useQueryClient();
  const router = useRouter();
  const m = useMutation({
    mutationFn: () => campaignService.submit(campaign.id, url.trim()),
    onSuccess: async (sub) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["submissions"] }), qc.invalidateQueries({ queryKey: ["earnings"] }), qc.invalidateQueries({ queryKey: ["campaign", campaign.id] })]);
      toast.success("Post submitted", { description: "We’ll track its views. Payouts are committed as it reaches milestones." });
      setUrl("");
      onOpenChange(false);
      router.push(`/creator/submissions/${sub.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && (err.status === 422 || err.status === 409)) setError(err.message);
      else toast.error("Couldn’t submit the post", { description: errorMessage(err) });
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setError(null);
      }}
    >
      <DialogContent title="Submit your post" description={`Paste the link to your published ${PLATFORM_LABEL[campaign.platform]} post. Each post can be submitted once.`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (url.trim()) m.mutate();
            else setError("Paste the link to your post.");
          }}
          className="flex flex-col gap-5"
          noValidate
        >
          <Field label="Post link" htmlFor={id} error={error ?? undefined} hint={`For example ${EXAMPLES[campaign.platform]}`}>
            <Input
              id={id}
              type="url"
              inputMode="url"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={EXAMPLES[campaign.platform]}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : `${id}-hint`}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={m.isPending}>
              Submit post
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
