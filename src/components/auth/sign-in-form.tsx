'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2, Mail, ShieldCheck } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getBrowserClient } from '@/lib/supabase/client'
import { IS_DEMO } from '@/lib/supabase/env'
import { signInSchema, type SignInValues } from '@/lib/validators'

/**
 * The one sign-in form, used by both entry points.
 *
 * There is deliberately no separate mechanism for owners. Which screen
 * someone arrives on decides nothing: the role is read from their profile
 * row after the link is followed, so an "owner sign-in" URL grants no more
 * than an employee one. If it did, the address itself would be the
 * credential and anyone who guessed it would be an owner.
 *
 * The two entry points differ only in what they say and where they send a
 * first-time claim.
 */

export type SignInMode = 'employee' | 'owner'

/** Where the flow currently is. Every branch has somewhere to go. */
type Phase =
  | { at: 'idle' }
  | { at: 'sending' }
  | { at: 'sent'; email: string }
  | { at: 'error'; message: string; canRetry: boolean }

/** Seconds before another link may be requested. */
const RESEND_COOLDOWN = 45

export function SignInForm({ mode, unclaimed }: { mode: SignInMode; unclaimed: boolean }) {
  const [phase, setPhase] = React.useState<Phase>({ at: 'idle' })
  const [cooldown, setCooldown] = React.useState(0)

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '' },
    mode: 'onChange',
  })

  // Countdown for the resend button, so a second link cannot be requested
  // faster than the provider will send one.
  React.useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [cooldown])

  /**
   * Self-registration is permitted in exactly one situation: nobody exists
   * yet, so there is nobody who could have invited the first owner. The
   * server decides this, not the client — `workspace_is_unclaimed()` stops
   * returning true the moment that first profile row is written.
   */
  const claiming = mode === 'owner' && unclaimed

  async function send(email: string) {
    const supabase = getBrowserClient()
    if (!supabase) {
      setPhase({
        at: 'error',
        message: 'This copy of Flowline is not connected to a database, so there is nothing to sign in to.',
        canRetry: false,
      })
      return
    }

    setPhase({ at: 'sending' })
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: claiming,
        },
      })

      if (error) {
        setPhase({ at: 'error', ...describeAuthError(error.message, claiming) })
        return
      }

      setPhase({ at: 'sent', email })
      setCooldown(RESEND_COOLDOWN)
    } catch {
      setPhase({
        at: 'error',
        message: 'We could not reach the sign-in service. Check your connection and try again.',
        canRetry: true,
      })
    }
  }

  const onSubmit = form.handleSubmit((values) => send(values.email.trim().toLowerCase()))

  if (phase.at === 'sent') {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
          <Mail className="h-6 w-6" strokeWidth={1.9} />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-ink">Check your email</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-muted text-pretty">
            We sent a sign-in link to <span className="font-medium text-ink">{phase.email}</span>. Open it on this
            device. The link works once and expires in an hour.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="glass"
            className="w-full"
            disabled={cooldown > 0}
            onClick={() => send(phase.email)}
          >
            {cooldown > 0 ? `Send another link in ${cooldown}s` : 'Send another link'}
          </Button>
          <Button variant="glass" className="w-full" onClick={() => setPhase({ at: 'idle' })}>
            Use a different email
          </Button>
        </div>

        <p className="text-[11.5px] leading-relaxed text-ink-faint">
          Nothing arrived? Check the spam folder. The sender is your Supabase project.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-1.5">
        <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">
          {claiming ? 'Set up the owner account' : mode === 'owner' ? 'Owner sign-in' : 'Sign in'}
        </h2>
        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          {claiming
            ? 'Nobody has set this company up yet. The first account becomes the owner — use your own work email, and confirm it from the link we send.'
            : 'Enter your work email and we will send you a link. There is no password to remember.'}
        </p>
      </div>

      {claiming && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-primary/[.06] px-3 py-2.5 text-[12px] leading-relaxed text-primary">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This only works once. After the owner exists, nobody can sign themselves up — everyone else has to be added
          by an owner.
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-5 space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            placeholder="you@yourcompany.com"
            aria-invalid={Boolean(form.formState.errors.email)}
            aria-describedby={form.formState.errors.email ? 'email-error' : undefined}
            {...form.register('email')}
          />
          {form.formState.errors.email && (
            <p id="email-error" role="alert" className="text-[12px] text-red-500">
              {form.formState.errors.email.message}
            </p>
          )}
        </div>

        {phase.at === 'error' && (
          <div role="alert" className="surface rounded-2xl p-3 text-[12.5px] leading-relaxed text-ink-muted">
            <p className="font-medium text-ink">{phase.message}</p>
            {!phase.canRetry && mode === 'employee' && (
              <p className="mt-1">
                If you are the owner setting this up for the first time, use the owner sign-in instead.
              </p>
            )}
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full gap-2"
          disabled={phase.at === 'sending' || !form.formState.isValid}
        >
          {phase.at === 'sending' ? <Loader2 className="animate-spin" /> : <Mail />}
          {claiming ? 'Create the owner account' : 'Send me a sign-in link'}
        </Button>
      </form>

      <p className="mt-4 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-faint">
        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
        Signing in confirms the address belongs to you — the link only works in the mailbox it was sent to.
      </p>
    </>
  )
}

/**
 * Turns a provider message into something a person can act on.
 *
 * Supabase's own strings are written for developers, and the one that matters
 * most here — a refused sign-up when the address is unknown — reads as
 * "Signups not allowed for otp", which tells an employee nothing about what
 * they should do instead.
 */
function describeAuthError(raw: string, claiming: boolean): { message: string; canRetry: boolean } {
  const text = raw.toLowerCase()

  if (text.includes('signups not allowed') || text.includes('signup is disabled')) {
    return {
      message: claiming
        ? 'This company has already been set up, so the owner account cannot be created again. Ask an existing owner to add you.'
        : 'That email is not on this company’s list yet. An owner has to add you before you can sign in.',
      canRetry: false,
    }
  }
  if (text.includes('rate limit') || text.includes('too many')) {
    return {
      message: 'Too many links have been requested for this address. Wait a minute and try again.',
      canRetry: true,
    }
  }
  if (text.includes('invalid') && text.includes('email')) {
    return { message: 'That does not look like a working email address.', canRetry: true }
  }
  return { message: raw || 'The sign-in link could not be sent. Try again.', canRetry: true }
}

/** Demo builds have no sign-in; callers use this to redirect away. */
export const SIGN_IN_DISABLED = IS_DEMO
