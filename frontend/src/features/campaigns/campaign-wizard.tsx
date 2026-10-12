"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { CampaignCover, COVER_THEME_COUNT, CoverSwatch } from "@/components/domain/campaign-cover";
import { MilestoneLadder } from "@/components/domain/milestone-ladder";
import { PLATFORM_LABEL, PlatformIcon } from "@/components/domain/platform";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input, Textarea } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDateTime, formatINR, formatNumber, rupeesInputToPaise } from "@/lib/format";
import { cn } from "@/lib/utils";
import { campaignService } from "@/services/campaigns";
import type { Campaign, Platform } from "@/types/api";
import { campaignFormSchema, EMPTY_FORM, formFromCampaign, parsedMilestones, toCampaignInput, type CampaignFormValues } from "./campaign-form-schema";

const STEPS = [
  { key: "basics", title: "Basics", fields: ["name", "description", "platform", "coverTheme", "coverImageUrl"] },
  { key: "ladder", title: "Payout ladder", fields: ["milestones"] },
  { key: "budget", title: "Budget & dates", fields: ["budget", "startsAt", "endsAt"] },
  { key: "review", title: "Review", fields: [] },
] as const;

/**
 * Create a campaign, or edit a draft. Published campaigns lock their money
 * terms, so they are edited elsewhere (name, brief, cover, end date only).
 */
export function CampaignWizard({ draft }: { draft?: Campaign }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: draft ? formFromCampaign(draft) : EMPTY_FORM,
    mode: "onTouched",
  });
  const milestones = useFieldArray({ control: form.control, name: "milestones" });
  const values = useWatch({ control: form.control }) as CampaignFormValues;
  const { errors } = form.formState;

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const input = toCampaignInput(form.getValues());
      if (draft) {
        const updated = await campaignService.update(draft.id, input);
        return publish ? campaignService.update(draft.id, { status: "LIVE" }) : updated;
      }
      return campaignService.create({ ...input, status: publish ? "LIVE" : "DRAFT" });
    },
    onSuccess: async (campaign, publish) => {
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      await qc.invalidateQueries({ queryKey: ["brand"] });
      toast.success(publish ? "Campaign published" : "Draft saved", {
        description: publish ? "Creators can now find it and submit posts." : "Publish it when you’re ready.",
      });
      router.push(`/brand/campaigns/${campaign.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 422) {
        const fields = err.fieldErrors();
        if (fields.budgetPaise) form.setError("budget", { message: fields.budgetPaise });
        if (fields.milestones) form.setError("milestones", { message: fields.milestones });
        if (fields.name) form.setError("name", { message: fields.name });
      }
      toast.error("Couldn’t save the campaign", { description: errorMessage(err) });
    },
  });

  async function next() {
    const ok = await form.trigger(STEPS[step]!.fields as unknown as FieldPath<CampaignFormValues>[], { shouldFocus: true });
    if (ok) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  const ladder = parsedMilestones(values.milestones ?? []);
  const topPayout = Math.max(0, ...ladder.map((m) => m.payoutPaise));
  const budgetPaise = rupeesInputToPaise(values.budget ?? "") ?? 0;
  const ids = { name: useId(), desc: useId(), img: useId(), budget: useId(), start: useId(), end: useId() };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0">
        <ol className="mb-6 flex flex-wrap gap-2" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => (i < step ? setStep(i) : undefined)}
                disabled={i > step}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold",
                  i === step ? "border-ink bg-ink text-white" : i < step ? "border-line-strong bg-surface hover:border-ink" : "border-line bg-paper text-faint",
                )}
              >
                <span className={cn("grid size-5 place-items-center rounded-full text-[11px]", i < step ? "bg-success text-white" : i === step ? "bg-white text-ink" : "bg-line text-muted")}>
                  {i < step ? <Check className="size-3" /> : i + 1}
                </span>
                {s.title}
              </button>
            </li>
          ))}
        </ol>

        <Panel>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (step < STEPS.length - 1) void next();
            }}
            className="flex flex-col gap-6 p-5 sm:p-7"
          >
            {step === 0 && (
              <>
                <Field label="Campaign name" htmlFor={ids.name} error={errors.name?.message} hint="Creators see this first. Make it specific.">
                  <Input id={ids.name} placeholder="Monsoon chai memes" aria-invalid={!!errors.name} {...form.register("name")} />
                </Field>
                <Field label="Brief" htmlFor={ids.desc} error={errors.description?.message} hint="What should posts be about? Anything off-limits?">
                  <Textarea id={ids.desc} rows={5} placeholder="Make the internet laugh about rainy-day chai cravings. Tag us and keep it wholesome." {...form.register("description")} />
                </Field>
                <fieldset>
                  <legend className="text-sm font-semibold">Platform</legend>
                  <Controller
                    control={form.control}
                    name="platform"
                    render={({ field }) => (
                      <div role="radiogroup" className="mt-2 grid grid-cols-2 gap-3 sm:max-w-md">
                        {(["INSTAGRAM", "YOUTUBE"] as Platform[]).map((p) => (
                          <button
                            key={p}
                            type="button"
                            role="radio"
                            aria-checked={field.value === p}
                            onClick={() => field.onChange(p)}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border-2 px-4 py-3 font-semibold",
                              field.value === p ? "border-indigo bg-indigo-tint text-indigo" : "border-line hover:border-line-strong",
                            )}
                          >
                            <PlatformIcon platform={p} className="size-5" /> {PLATFORM_LABEL[p]}
                          </button>
                        ))}
                      </div>
                    )}
                  />
                </fieldset>
                <fieldset>
                  <legend className="text-sm font-semibold">Cover style</legend>
                  <Controller
                    control={form.control}
                    name="coverTheme"
                    render={({ field }) => (
                      <div className="mt-2 flex flex-wrap gap-3">
                        {Array.from({ length: COVER_THEME_COUNT }, (_, i) => (
                          <CoverSwatch key={i} theme={i} selected={field.value === i} onSelect={() => field.onChange(i)} />
                        ))}
                      </div>
                    )}
                  />
                </fieldset>
                <Field label="Cover image link (optional)" htmlFor={ids.img} error={errors.coverImageUrl?.message} hint="An https:// image you own. Leave empty to use the cover style.">
                  <Input id={ids.img} placeholder="https://…" inputMode="url" {...form.register("coverImageUrl")} />
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <div>
                  <h2 className="text-lg font-bold">Set the milestones</h2>
                  <p className="mt-1 text-sm text-muted">
                    A post earns the payout of the <strong className="text-ink">highest</strong> milestone it reaches. Payouts don’t add up: list each milestone at its
                    full value. Once published, milestones can’t be changed.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="hidden grid-cols-[1fr_1fr_2.5rem] gap-3 text-[13px] font-semibold text-muted sm:grid">
                    <span>Views needed</span>
                    <span>Payout (₹)</span>
                    <span className="sr-only">Remove</span>
                  </div>
                  {milestones.fields.map((f, i) => {
                    const e = errors.milestones?.[i];
                    return (
                      <div key={f.id} className="grid grid-cols-[1fr_1fr_2.5rem] items-start gap-3">
                        <div>
                          <Input
                            aria-label={`Milestone ${i + 1} views`}
                            inputMode="numeric"
                            placeholder="50000"
                            aria-invalid={!!e?.views}
                            {...form.register(`milestones.${i}.views`)}
                          />
                          <FieldError>{e?.views?.message}</FieldError>
                        </div>
                        <div>
                          <Input aria-label={`Milestone ${i + 1} payout in rupees`} inputMode="decimal" placeholder="2000" aria-invalid={!!e?.payout} {...form.register(`milestones.${i}.payout`)} />
                          <FieldError>{e?.payout?.message}</FieldError>
                        </div>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remove milestone ${i + 1}`} onClick={() => milestones.remove(i)} disabled={milestones.fields.length === 1}>
                          <Trash2 />
                        </Button>
                      </div>
                    );
                  })}
                  <FieldError>{errors.milestones?.message ?? errors.milestones?.root?.message}</FieldError>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={milestones.fields.length >= 20}
                      onClick={() => {
                        const last = ladder.at(-1);
                        milestones.append({ views: last ? String(last.views * 2) : "10000", payout: last ? String(Math.round((last.payoutPaise * 2) / 100)) : "500" });
                      }}
                    >
                      <Plus /> Add milestone
                    </Button>
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <Field
                  label="Total budget (₹)"
                  htmlFor={ids.budget}
                  error={errors.budget?.message}
                  hint={topPayout > 0 ? `Your top payout is ${formatINR(topPayout)}. The budget is a hard cap: once it’s committed, new payouts stop.` : "The budget is a hard cap on total payouts."}
                >
                  <Input id={ids.budget} inputMode="decimal" placeholder="25000" aria-invalid={!!errors.budget} {...form.register("budget")} />
                </Field>
                {budgetPaise > 0 && topPayout > 0 && (
                  <p className="rounded-md bg-paper px-4 py-3 text-sm">
                    This budget fully pays <strong className="tabular">{formatNumber(Math.floor(budgetPaise / topPayout))}</strong> post
                    {Math.floor(budgetPaise / topPayout) === 1 ? "" : "s"} at the top milestone. If it runs short, the last post is partly funded and the rest wait for a
                    top-up — nobody is paid twice.
                  </p>
                )}
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Starts (optional)" htmlFor={ids.start} error={errors.startsAt?.message} hint="Leave empty to start when published.">
                    <Input id={ids.start} type="datetime-local" {...form.register("startsAt")} />
                  </Field>
                  <Field label="Submissions close (optional)" htmlFor={ids.end} error={errors.endsAt?.message} hint="Posts already submitted keep earning.">
                    <Input id={ids.end} type="datetime-local" {...form.register("endsAt")} />
                  </Field>
                </div>
              </>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-5">
                <CampaignCover theme={values.coverTheme} imageUrl={values.coverImageUrl || null} name={values.name} className="h-28 rounded-lg" />
                <div>
                  <h2 className="text-2xl font-bold">{values.name || "Untitled campaign"}</h2>
                  <p className="mt-1 text-sm text-muted">{PLATFORM_LABEL[values.platform]}</p>
                  {values.description && <p className="mt-3 whitespace-pre-line text-[15px]">{values.description}</p>}
                </div>
                <dl className="grid grid-cols-2 gap-4 border-y border-line py-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted">Budget</dt>
                    <dd className="tabular text-lg font-bold">{formatINR(budgetPaise)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Starts</dt>
                    <dd className="font-semibold">{values.startsAt ? formatDateTime(new Date(values.startsAt).toISOString()) : "When published"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Submissions close</dt>
                    <dd className="font-semibold">{values.endsAt ? formatDateTime(new Date(values.endsAt).toISOString()) : "No end date"}</dd>
                  </div>
                </dl>
                <p className="text-sm text-muted">Publishing locks the budget floor, platform and milestones so creators can trust the terms. You can always top up the budget later.</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <Button type="button" variant="ghost" onClick={() => (step === 0 ? router.back() : setStep(step - 1))}>
                {step === 0 ? "Cancel" : "Back"}
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="submit">Continue</Button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" loading={save.isPending && save.variables === false} disabled={save.isPending} onClick={() => save.mutate(false)}>
                    Save as draft
                  </Button>
                  <Button type="button" loading={save.isPending && save.variables === true} disabled={save.isPending} onClick={() => save.mutate(true)}>
                    Publish campaign
                  </Button>
                </div>
              )}
            </div>
          </form>
        </Panel>
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start" aria-label="Live preview">
        <Panel className="overflow-hidden">
          <CampaignCover theme={values.coverTheme} imageUrl={values.coverImageUrl || null} name={values.name} className="h-20" />
          <div className="p-5">
            <div className="text-sm font-semibold text-muted">What creators will see</div>
            <div className="mt-1 text-lg font-bold">{values.name || "Untitled campaign"}</div>
            {ladder.length > 0 ? (
              <MilestoneLadder milestones={ladder} size="sm" className="mt-4" caption="Highest milestone reached pays. Payouts don’t stack." />
            ) : (
              <p className="mt-4 text-sm text-muted">Add milestones to preview the ladder.</p>
            )}
            {budgetPaise > 0 && <p className="tabular mt-4 border-t border-line pt-3 text-sm">Budget {formatINR(budgetPaise)}</p>}
          </div>
        </Panel>
      </aside>
    </div>
  );
}
