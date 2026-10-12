"use client";

import { useQuery } from "@tanstack/react-query";
import { configService } from "@/services/submissions";

/** Public runtime flags from the API (e.g. whether the view simulator is available). */
export function usePublicConfig() {
  return useQuery({ queryKey: ["config"], queryFn: configService.get, staleTime: 5 * 60_000 });
}
