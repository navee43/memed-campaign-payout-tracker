"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { refreshSession } from "@/lib/api";
import { authService } from "@/services/auth";
import type { Role, User } from "@/types/api";

export const ME_KEY = ["auth", "me"] as const;

/**
 * Current user, or null when signed out. Uses the non-throwing session probe
 * and performs one silent refresh when the access cookie has expired but a
 * refresh cookie exists.
 */
export function useMe() {
  return useQuery<User | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      const first = await authService.session();
      if (first.user || !first.refreshable) return first.user;
      if (!(await refreshSession())) return null;
      return (await authService.session()).user;
    },
    staleTime: 60_000,
  });
}

export function homeFor(role: Role): string {
  return role === "BRAND" ? "/brand" : "/creator";
}

export function useSignOut() {
  const qc = useQueryClient();
  const router = useRouter();
  return useCallback(
    async (everywhere = false) => {
      try {
        await (everywhere ? authService.logoutAll() : authService.logout());
      } finally {
        qc.clear();
        qc.setQueryData(ME_KEY, null);
        router.replace("/login");
      }
    },
    [qc, router],
  );
}
