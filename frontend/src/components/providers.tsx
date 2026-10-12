"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { ApiError } from "@/lib/api";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        // Retry only transient failures; 4xx answers are final.
        retry: (count, err) => (err instanceof ApiError ? (err.status === 0 || err.status >= 500) && count < 2 : count < 2),
      },
    },
    queryCache: new QueryCache(),
    mutationCache: new MutationCache(),
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        position="bottom-right"
        closeButton
        toastOptions={{
          classNames: {
            toast: "!rounded-lg !border !border-line !bg-surface !text-ink !shadow-pop !font-sans",
            description: "!text-muted",
            success: "[&_[data-icon]]:!text-success",
            error: "[&_[data-icon]]:!text-danger",
            warning: "[&_[data-icon]]:!text-marigold-deep",
          },
        }}
      />
    </QueryClientProvider>
  );
}
