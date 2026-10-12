"use client";

import { useQuery } from "@tanstack/react-query";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/layout/states";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/features/campaigns/campaign-dialogs";
import { useMe, useSignOut } from "@/hooks/use-auth";
import { formatDateTime } from "@/lib/format";
import { authService } from "@/services/auth";

function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export function AccountPage() {
  const me = useMe();
  const signOut = useSignOut();
  const sessions = useQuery({ queryKey: ["auth", "sessions"], queryFn: authService.sessions });
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <PageHeader title="Account" description="Your profile and where you’re signed in." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Panel>
          <PanelHeader title="Profile" />
          <PanelBody>
            <dl className="grid gap-4 text-sm">
              <div>
                <dt className="text-muted">Name</dt>
                <dd className="font-semibold">{me.data?.name}</dd>
              </div>
              <div>
                <dt className="text-muted">Email</dt>
                <dd className="font-semibold">{me.data?.email}</dd>
              </div>
              <div>
                <dt className="text-muted">Account type</dt>
                <dd className="font-semibold">{me.data?.role === "BRAND" ? "Brand" : "Creator"}</dd>
              </div>
            </dl>
            <Button variant="outline" className="mt-6" onClick={() => void signOut()}>
              <LogOut /> Sign out
            </Button>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader
            title="Active sessions"
            description="Each browser you’re signed in on. Sessions renew automatically while you use them."
            action={
              <Button variant="danger" size="sm" onClick={() => setConfirmAll(true)}>
                Sign out everywhere
              </Button>
            }
          />
          {sessions.isLoading ? (
            <SkeletonRows rows={2} className="p-5" />
          ) : sessions.isError ? (
            <PanelBody>
              <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
            </PanelBody>
          ) : (
            <ul className="divide-y divide-line">
              {(sessions.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <MonitorSmartphone className="size-5 text-muted" aria-hidden />
                  <div>
                    <div className="font-semibold">{describeAgent(s.userAgent)}</div>
                    <div className="text-muted">Signed in {formatDateTime(s.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Sign out on every device?"
        description="All sessions end immediately, including this one. You’ll need to sign in again."
        confirmLabel="Sign out everywhere"
        tone="danger"
        loading={busy}
        onConfirm={() => {
          setBusy(true);
          void signOut(true);
        }}
      />
    </>
  );
}
