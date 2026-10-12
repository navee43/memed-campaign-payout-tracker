import { z } from "zod";
import { ROLES } from "../types/domain";

const email = z.string().trim().max(254).pipe(z.email("Enter a valid email address"));

export const passwordRule = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Password must include at least one letter and one number");

export const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
    email,
    password: passwordRule,
    role: z.enum(ROLES, { error: "Choose Brand or Creator" }),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, "Password is required").max(128),
  })
  .strict();
