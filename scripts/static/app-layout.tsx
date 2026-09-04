'use client'

import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { useCurrentUser } from '@/hooks/use-flowline'

/**
 * Client-side replacement for the middleware's route protection.
 *
 * A static build has no middleware, so a signed-out visitor would otherwise
 * reach the app shell and see an empty screen rather than the sign-in page.
 *
 * This is a redirect for their benefit, not a security control, and it never
 * was one: the middleware could only ever hide the interface. Every row the
 * app can read is decided by row level security inside Postgres against the
 * caller's own token, so a signed-out browser that skipped this check still
 * gets nothing back.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { profile, isLoading, isDemo } = useCurrentUser()

  useEffect(() => {
    if (isLoading || isDemo || profile) return
    router.replace('/login')
  }, [isLoading, isDemo, profile, router])

  return <AppShell>{children}</AppShell>
}
