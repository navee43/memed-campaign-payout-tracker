import { z } from "zod";
import { FUNDING_STATUSES } from "../types/domain";
import { paginationSchema } from "../utils/pagination";
import { boolFromQuery, isoDate, objectId } from "./common";

export const createSubmissionSchema = z
  .object({ postUrl: z.string().trim().min(1, "Paste the link to your post").max(2048) })
  .strict();

export const viewUpdateSchema = z
  .object({
    views: z
      .number({ error: "views must be a number" })
      .int("views must be a whole number")
      .min(0, "views cannot be negative")
      .max(Number.MAX_SAFE_INTEGER, "views is too large"),
    /** When the platform observed this count. Defaults to now. Used to reject stale snapshots. */
    observedAt: isoDate.optional(),
  })
  .strict();

export const idempotencyKeyHeader = z
  .string()
  .trim()
  .min(8, "Idempotency-Key must be 8-128 characters")
  .max(128, "Idempotency-Key must be 8-128 characters")
  .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency-Key may only contain letters, digits and . _ : -");

export const listSubmissionsQuery = paginationSchema
  .extend({
    fundingStatus: z.enum(FUNDING_STATUSES).optional(),
    flagged: boolFromQuery.optional(),
    sort: z.enum(["newest", "views", "earnings"]).default("newest"),
    /** Creator's own list only: narrow to one campaign. */
    campaignId: objectId.optional(),
  })
  .strict();

export const rejectSubmissionSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

export type ViewUpdateInput = z.infer<typeof viewUpdateSchema>;
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuery>;
