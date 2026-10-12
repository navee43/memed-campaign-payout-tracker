import type { z } from "zod";

/** Parses untrusted input; a ZodError becomes a 422 in the error handler. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  return schema.parse(data);
}
