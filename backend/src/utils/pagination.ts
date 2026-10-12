import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function skipFor({ page, pageSize }: Pagination): number {
  return (page - 1) * pageSize;
}
