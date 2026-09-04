'use client'

import { Waves } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

/**
 * Client-side replacement for the server route of the same path.
 *
 * The hosted app exchanges the sign-in code on the server and sets a cookie.
 * A static build has no server, so the exchange happens here instead:
 * supabase-js reads the code from the URL, swaps it for a session, and stores
 * it in this browser. The security model is unchanged — the code is
 * single-use and the resulting token is still checked by Postgres on every
 * query through row level security.
 */
function Callback() {
  const router = useRouter()
  const params = useSearchParams()
  const [message, setMessage] = useState('Signing you in…')

  useEffect(() => {
    const supabase = getBrowserClient()
    if (!supabase) {
      router.replace('/')
      return
    }

    const described = params.get('error_description')
    if (described) {
      router.replace(`/login?error=${encodeURIComponent(described)}`)
      return
    }

    const code = params.get('code')
    if (!code) {
      router.replace('/login')
      return
    }

    let cancelled = false
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (cancelled) return
        if (error) {
          router.replace('/login?error=That+sign-in+link+has+expired.+Please+request+a+new+one.')
          return
        }
        // Only ever go to a path on this site.
        const next = params.get('next') ?? '/'
        router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/')
      })
      .catch(() => {
        if (!cancelled) setMessage('Something went wrong. Try the link again.')
      })

    return () => {
      cancelled = true
    }
  }, [params, router])

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-14 w-14 animate-float items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(250_84%_68%)] to-[hsl(250_84%_54%)] text-white shadow-[0_8px_28px_-6px_rgba(109,88,240,.6)]">
          <Waves className="h-6 w-6" strokeWidth={2.2} />
        </div>
        <p className="text-[14px] font-medium text-ink-muted">{message}</p>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  // useSearchParams needs a Suspense boundary when the page is prerendered.
  return (
    <Suspense fallback={null}>
      <Callback />
    </Suspense>
  )
}
