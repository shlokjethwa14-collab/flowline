'use client'

import { Loader2, ShieldCheck, Waves } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { SignInForm } from '@/components/auth/sign-in-form'
import { useWorkspaceUnclaimed } from '@/hooks/use-workspace-claim'
import { IS_DEMO } from '@/lib/supabase/env'

/**
 * The owner's way in.
 *
 * Worth being explicit about what this is and is not. It is a separate
 * *entry point*, not a separate *mechanism*: the link it sends is the same
 * link the employee screen sends, and the role that comes back is read from
 * the profile row, not from the address that was visited. Nobody becomes an
 * owner by finding this URL.
 *
 * The one thing it can do that the employee screen cannot is create the very
 * first account — and only while the workspace has nobody in it at all, which
 * the server decides and which stops being true the moment that account
 * exists.
 */
export default function OwnerLoginPage() {
  const router = useRouter()
  const unclaimed = useWorkspaceUnclaimed()

  useEffect(() => {
    if (IS_DEMO) router.replace('/')
  }, [router])

  return (
    <main className="depth-scene flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(250_84%_68%)] to-[hsl(250_84%_54%)] text-white shadow-[0_10px_26px_-8px_rgba(109,88,240,.6)]">
            <Waves className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-none tracking-[-0.025em] text-ink">Flowline</h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-muted">
              <ShieldCheck className="h-3.5 w-3.5" />
              Owner access
            </p>
          </div>
        </div>

        <div className="glass glass-thick rounded-3xl p-6 sm:p-7">
          {unclaimed === null ? (
            // Neither form is shown until the server has answered. Rendering
            // the claim form first and then swapping it would offer to create
            // an owner for a company that already has one.
            <div className="flex items-center gap-2.5 py-6 text-[13.5px] text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking this company’s setup…
            </div>
          ) : (
            <SignInForm mode="owner" unclaimed={unclaimed} />
          )}

          <p className="mt-4 border-t border-[var(--glass-border)] pt-4 text-[12.5px] text-ink-muted">
            Not an owner?{' '}
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Employee sign-in
            </Link>
          </p>
        </div>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink-faint">
          Owners and employees sign in the same way. What you can see and do is decided by your profile in the company
          database, never by which page you signed in from.
        </p>
      </div>
    </main>
  )
}
