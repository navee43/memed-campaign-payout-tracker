"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { homeFor, ME_KEY } from "@/hooks/use-auth";
import { ApiError, errorMessage } from "@/lib/api";
import { authService } from "@/services/auth";
import { PasswordInput } from "./password-input";
import { loginSchema, safeNext, type LoginValues } from "./schemas";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const user = await authService.login(values);
      qc.setQueryData(ME_KEY, user);
      toast.success(`Signed in as ${user.name}`);
      router.replace(safeNext(params.get("next")) ?? homeFor(user.role));
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        for (const [path, msg] of Object.entries(err.fieldErrors())) form.setError(path as keyof LoginValues, { message: msg });
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
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} {...form.register("email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <PasswordInput id="password" autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} {...form.register("password")} />
      </Field>
      <Button type="submit" size="lg" loading={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-sm text-muted">
        New to Meme’d?{" "}
        <Link href="/signup" className="font-semibold text-indigo hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
