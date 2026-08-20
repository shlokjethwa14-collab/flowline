'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              // Permission problems will never succeed on retry.
              const message = error instanceof Error ? error.message : ''
              if (message.includes('row-level security') || message.includes('permission')) return false
              return failureCount < 2
            },
          },
          mutations: { retry: 0 },
        },
      }),
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
