'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { installWebApiTransport } from '@/lib/api-transport';

// No topo do módulo, e não dentro do componente: `apiFetch` pode ser chamado por
// qualquer client component, e um efeito rodaria tarde demais para o primeiro.
installWebApiTransport();

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
