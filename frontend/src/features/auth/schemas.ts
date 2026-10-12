import { z } from "zod";

/** Mirrors the API's rules so most mistakes are caught before a round trip. The server still validates everything. */
export const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email").pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Enter your password"),
});

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(80, "Use at most 80 characters"),
  email: z.string().trim().min(1, "Enter your email").pipe(z.email("Enter a valid email address")),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(128, "Use at most 128 characters")
    .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Include at least one letter and one number"),
  role: z.enum(["BRAND", "CREATOR"], { error: "Choose how you’ll use Meme’d" }),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;

/** Only same-site relative paths are allowed as post-login redirects (no open redirects). */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}
