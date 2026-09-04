'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

/**
 * Client-side replacement for the sign-out server route.
 *
 * The hosted app clears the session cookie on the server. Here the session
 * lives in this browser, so supabase-js clears it directly and we return to
 * the sign-in screen.
 */
export default function SignOutPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = getBrowserClient()
    const finish = () => router.replace('/login')
    if (!supabase) {
      finish()
      return
    }
    supabase.auth.signOut().then(finish).catch(finish)
  }, [router])

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <p className="text-[14px] font-medium text-ink-muted">Signing you out…</p>
    </div>
  )
}
