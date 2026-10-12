"use client";

import { Compass, FilePlus2, Gauge, LayoutList, LogOut, Menu, UserRound, Wallet, Film } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { homeFor, useMe, useSignOut } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Role, User } from "@/types/api";
import { Dialog, DialogContent } from "../ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "../ui/dropdown";
import { Skeleton } from "../ui/skeleton";
import { Logo } from "./logo";
import { ErrorState } from "./states";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const NAV: Record<Role, NavItem[]> = {
  BRAND: [
    { href: "/brand", label: "Overview", icon: Gauge, exact: true },
    { href: "/brand/campaigns", label: "Campaigns", icon: LayoutList },
    { href: "/brand/campaigns/new", label: "New campaign", icon: FilePlus2, exact: true },
  ],
  CREATOR: [
    { href: "/creator", label: "Earnings", icon: Wallet, exact: true },
    { href: "/creator/discover", label: "Discover", icon: Compass },
    { href: "/creator/submissions", label: "My posts", icon: Film },
  ],
};

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  if (item.href === "/brand/campaigns" && pathname === "/brand/campaigns/new") return false;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV[role].map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-semibold transition-colors",
              active ? "bg-white text-ink" : "text-white/75 hover:bg-white/10 hover:text-white",
            )}
          >
            <item.icon className="size-[18px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({ user }: { user: User }) {
  const signOut = useSignOut();
  return (
    <Dropdown>
      <DropdownTrigger className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-white hover:bg-white/10">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-marigold font-bold text-ink" aria-hidden>
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{user.name}</span>
          <span className="block truncate text-[12px] text-white/60">{user.role === "BRAND" ? "Brand account" : "Creator account"}</span>
        </span>
      </DropdownTrigger>
      <DropdownContent align="start" side="top">
        <DropdownItem asChild>
          <Link href="/account">
            <UserRound /> Account & sessions
          </Link>
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-dvh lg:pl-64" aria-busy>
      <div className="fixed inset-y-0 left-0 hidden w-64 bg-ink lg:block" />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="mt-4 h-5 w-96 max-w-full" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="mt-6 h-72" />
      </div>
    </div>
  );
}

/**
 * Authenticated layout. The role check here is for navigation only — every
 * API call is authorised again on the server.
 */
export function AppShell({ role, children }: { role?: Role; children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = me.data;

  useEffect(() => {
    if (me.isLoading || me.isError) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (role && user.role !== role) router.replace(homeFor(user.role));
  }, [me.isLoading, me.isError, user, role, router, pathname]);

  if (me.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }
  if (me.isLoading || !user || (role && user.role !== role)) return <ShellSkeleton />;

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col justify-between bg-ink px-4 py-6 lg:flex">
        <div className="flex flex-col gap-8">
          <Logo tone="white" href={homeFor(user.role)} className="px-3" />
          <NavLinks role={user.role} />
        </div>
        <UserMenu user={user} />
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo href={homeFor(user.role)} />
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <button type="button" onClick={() => setMenuOpen(true)} className="rounded-md p-2 hover:bg-indigo-tint" aria-label="Open menu">
            <Menu className="size-6" />
          </button>
          <DialogContent title="Menu" side="left" className="bg-ink">
            <div className="flex h-dvh flex-col justify-between px-4 py-6">
              <div className="flex flex-col gap-8">
                <Logo tone="white" href={homeFor(user.role)} className="px-3" />
                <NavLinks role={user.role} onNavigate={() => setMenuOpen(false)} />
              </div>
              <UserMenu user={user} />
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}
