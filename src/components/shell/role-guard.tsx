'use client'

import { Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { useCurrentUser } from '@/hooks/use-flowline'
import { homeFor } from './nav-items'

/**
 * Keeps admin-only screens out of an employee's hands even if they type the
 * URL directly. Row Level Security is still the real boundary — this is the
 * friendly front door.
 */
export function AdminOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const router = useRouter()
  const { profile, isAdmin, isLoading } = useCurrentUser()

  useEffect(() => {
    if (!isLoading && profile && !isAdmin) {
      router.replace(homeFor(profile.role))
    }
  }, [isLoading, profile, isAdmin, router])

  if (isLoading) return <>{fallback}</>

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Lock}
        title="This section is for the owner"
        description="Taking you back to your own work…"
        className="mt-10"
      />
    )
  }

  return <>{children}</>
}
