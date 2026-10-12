"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input } from "@/components/ui/input";
import { ME_KEY } from "@/hooks/use-auth";
import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth";
import { PasswordInput } from "./password-input";
import { signupSchema, type SignupValues } from "./schemas";

const ROLES = [
  { value: "BRAND", title: "I’m a brand", body: "Fund campaigns and pay for views.", icon: Building2 },
  { value: "CREATOR", title: "I’m a creator", body: "Post, submit links and earn.", icon: Sparkles },
] as const;

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const preset = params.get("role")?.toUpperCase();
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", role: preset === "BRAND" || preset === "CREATOR" ? preset : (undefined as unknown as SignupValues["role"]) },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const user = await authService.signup(values);
      qc.setQueryData(ME_KEY, user);
      toast.success("Account created", { description: user.role === "BRAND" ? "Set up your first campaign next." : "Browse live campaigns to get started." });
      router.replace(user.role === "BRAND" ? "/brand/campaigns/new" : "/creator/discover");
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") {
        form.setError("email", { message: err.message });
      } else if (err instanceof ApiError && err.status === 422) {
        const fields = err.fieldErrors();
        for (const [path, msg] of Object.entries(fields)) form.setError(path as keyof SignupValues, { message: msg });
        if (Object.keys(fields).length === 0) form.setError("root", { message: err.message });
      } else {
        form.setError("root", { message: errorMessage(err) });
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {errors.root?.message && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
          {errors.root.message}
        </div>
      )}

      <fieldset>
        <legend className="text-sm font-semibold">How will you use Meme’d?</legend>
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <div role="radiogroup" aria-invalid={!!errors.role} className="mt-2 grid grid-cols-2 gap-3">
              {ROLES.map((r) => {
                const selected = field.value === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => field.onChange(r.value)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-colors",
                      selected ? "border-indigo bg-indigo-tint" : "border-line bg-surface hover:border-line-strong",
                    )}
                  >
                    <r.icon className={cn("size-5", selected ? "text-indigo" : "text-muted")} aria-hidden />
                    <span className="font-bold">{r.title}</span>
                    <span className="text-[13px] text-muted">{r.body}</span>
                  </button>
                );
              })}
            </div>
          )}
        />
        <div className="mt-1.5">
          <FieldError>{errors.role?.message}</FieldError>
        </div>
      </fieldset>

      <Field label="Name" htmlFor="name" hint="Your page, channel or brand name works too." error={errors.name?.message}>
        <Input id="name" autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : "name-hint"} {...form.register("name")} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} {...form.register("email")} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters, with a letter and a number." error={errors.password?.message}>
        <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : "password-hint"} {...form.register("password")} />
      </Field>

      <Button type="submit" size="lg" loading={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-indigo hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
