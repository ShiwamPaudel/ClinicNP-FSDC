"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { NavProgress } from "@/components/app/nav-progress";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <NavProgress />
          {children}
        </ToastProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
