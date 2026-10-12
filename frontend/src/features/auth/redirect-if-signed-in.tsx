"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { homeFor, useMe } from "@/hooks/use-auth";

/**
 * Sends people who were ALREADY signed in when they opened the page straight
 * to their dashboard. Sign-ins that happen on this page are left to the form,
 * which knows where to go next.
 */
export function RedirectIfSignedIn() {
  const me = useMe();
  const router = useRouter();
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || me.isLoading) return;
    decided.current = true;
    if (me.data) router.replace(homeFor(me.data.role));
  }, [me.isLoading, me.data, router]);
  return null;
}
