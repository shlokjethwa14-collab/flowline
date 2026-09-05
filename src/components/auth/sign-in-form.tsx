'use client'

import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  credentialToEmail,
  identifierProblem,
  loginIdProblem,
  MIN_PASSWORD_LENGTH,
  normaliseLoginId,
} from '@/lib/accounts'
import { getBrowserClient } from '@/lib/supabase/client'

/**
 * Signing in with a login ID and a password.
 *
 * There is deliberately no separate mechanism for owners. Which screen
 * someone arrives on decides nothing: the role is read from their profile row
 * after they are signed in, so an "owner sign-in" URL grants no more than an
 * employee one. If it did, the address itself would be the credential.
 *
 * The login ID is turned into a synthetic address here and handed to
 * Supabase's ordinary password sign-in. No password is checked, hashed or
 * stored by this application.
 */

export type SignInMode = 'employee' | 'owner'

type Phase =
  | { at: 'idle' }
  | { at: 'signing' }
  | { at: 'error'; message: string }

export function SignInForm({ mode, unclaimed }: { mode: SignInMode; unclaimed: boolean }) {
  const [loginId, setLoginId] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [reveal, setReveal] = React.useState(false)
  const [touched, setTouched] = React.useState(false)
  const [phase, setPhase] = React.useState<Phase>({ at: 'idle' })

  const idProblem = touched ? identifierProblem(loginId) : null
  const canSubmit = identifierProblem(loginId) === null && password.length > 0 && phase.at !== 'signing'

  /**
   * The first account is created by claiming, not by signing in. Only offered
   * while the workspace has nobody in it, which the server decides — see
   * useWorkspaceUnclaimed.
   */
  const claiming = mode === 'owner' && unclaimed

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (identifierProblem(loginId) !== null) return

    const supabase = getBrowserClient()
    if (!supabase) {
      setPhase({ at: 'error', message: 'This copy of Flowline is not connected to a database.' })
      return
    }

    setPhase({ at: 'signing' })

    const { error } = await supabase.auth.signInWithPassword({
      // A login ID becomes a synthetic address; a real one is used as typed.
      email: credentialToEmail(loginId),
      password,
    })

    if (error) {
      /*
       * One message for a wrong ID and a wrong password, on purpose. Telling
       * someone the ID was right but the password was wrong confirms which
       * accounts exist, which is exactly what a stranger trying names would
       * want to learn.
       */
      const rateLimited = /rate|too many/i.test(error.message)
      setPhase({
        at: 'error',
        message: rateLimited
          ? 'Too many attempts. Wait a minute and try again.'
          : 'That login ID and password do not match. Check with your owner if you are not sure.',
      })
      setPassword('')
      return
    }

    /*
     * A full reload rather than a client navigation, deliberately.
     *
     * The session has just changed identity. Every cached query in memory
     * belongs to the previous state, and a soft navigation would carry that
     * cache across — showing the signed-out shell, or worse, the previous
     * user's data until each query happened to refetch. Reloading discards
     * all of it in one step.
     */
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/')
  }

  if (claiming) {
    return <ClaimOwnerForm />
  }

  return (
    <>
      <div className="space-y-1.5">
        <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">
          {mode === 'owner' ? 'Owner sign-in' : 'Sign in'}
        </h2>
        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          Use the login ID and password your owner gave you. Owners may use their email instead.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="login-id">Login ID</Label>
          <Input
            id="login-id"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            placeholder="suresh"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={Boolean(idProblem)}
            aria-describedby={idProblem ? 'login-id-error' : undefined}
          />
          {idProblem && (
            <p id="login-id-error" role="alert" className="text-[12px] text-red-500">
              {idProblem}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={reveal ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-11"
            />
            {/* Typing a password given to you verbally, on a phone, without
                being able to see it is how people get locked out. */}
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              aria-label={reveal ? 'Hide password' : 'Show password'}
              aria-pressed={reveal}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-faint hover:text-ink"
            >
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {phase.at === 'error' && (
          <p role="alert" className="surface rounded-2xl p-3 text-[12.5px] leading-relaxed text-ink">
            {phase.message}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full gap-2" disabled={!canSubmit}>
          {phase.at === 'signing' ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Sign in
        </Button>
      </form>

      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-faint">
        Forgotten your password? Only an owner can set a new one — there is no email to reset it from.
      </p>
    </>
  )
}

/**
 * The very first account.
 *
 * Self-registration is permitted exactly once, while the workspace is empty,
 * because there is nobody who could have created the first owner. Done in the
 * browser with an ordinary sign-up rather than through the edge function,
 * which requires an owner to already exist.
 */
function ClaimOwnerForm() {
  const [loginId, setLoginId] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [fullName, setFullName] = React.useState('')
  const [recoveryEmail, setRecoveryEmail] = React.useState('')
  const [phase, setPhase] = React.useState<Phase>({ at: 'idle' })

  const idProblem = loginId ? loginIdProblem(loginId) : null
  const emailProblem =
    recoveryEmail.trim().length > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recoveryEmail.trim())
      ? 'That email address does not look right.'
      : null
  const shortPassword = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const canSubmit =
    loginIdProblem(loginId) === null &&
    emailProblem === null &&
    password.length >= MIN_PASSWORD_LENGTH &&
    fullName.trim().length >= 2 &&
    phase.at !== 'signing'

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const supabase = getBrowserClient()
    if (!supabase) return

    /*
     * The owner may register against a real address instead of the synthetic
     * one, and it matters for two separate reasons.
     *
     * Recovery: this is the only account nobody else can reset the password
     * for. Without a reachable address, a forgotten owner password means
     * repairing the project from the Supabase dashboard.
     *
     * Delivery: while a project has "Confirm email" switched on, Supabase
     * posts a confirmation on sign-up. Sent to a synthetic address it can
     * never arrive, and the attempts exhaust the project's mail allowance —
     * which is what produced "email rate limit exceeded". A real address
     * makes that message deliverable, so the account can be created without
     * touching the project's configuration.
     *
     * Staff never see this. They are created by the owner with
     * `email_confirm` already set, so no mail is sent for them at all.
     */
    const identifier = recoveryEmail.trim()
      ? recoveryEmail.trim().toLowerCase()
      : credentialToEmail(loginId)

    setPhase({ at: 'signing' })
    const { error } = await supabase.auth.signUp({
      email: identifier,
      password,
      options: { data: { full_name: fullName.trim(), login_id: normaliseLoginId(loginId) } },
    })

    if (error) {
      setPhase({ at: 'error', message: describeSignUpError(error.message) })
      return
    }

    // handle_new_user() writes the profile and makes the first one an owner.
    /*
     * A full reload rather than a client navigation, deliberately.
     *
     * The session has just changed identity. Every cached query in memory
     * belongs to the previous state, and a soft navigation would carry that
     * cache across — showing the signed-out shell, or worse, the previous
     * user's data until each query happened to refetch. Reloading discards
     * all of it in one step.
     */
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/')
  }

  return (
    <>
      <div className="space-y-1.5">
        <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">Set up the owner account</h2>
        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          Nobody has set this company up yet. The first account becomes the owner, and can then create everyone else.
        </p>
      </div>

      <p className="mt-3 flex items-start gap-2 rounded-2xl bg-primary/[.06] px-3 py-2.5 text-[12px] leading-relaxed text-primary">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        This only works once. Write the password down somewhere safe — there is no email to reset it from.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="claim-name">Your name</Label>
          <Input id="claim-name" autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="claim-id">Login ID</Label>
          <Input
            id="claim-id"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="rajesh"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            aria-invalid={Boolean(idProblem)}
            aria-describedby={idProblem ? 'claim-id-error' : undefined}
          />
          {idProblem && (
            <p id="claim-id-error" role="alert" className="text-[12px] text-red-500">
              {idProblem}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="claim-password">Password</Label>
          <Input
            id="claim-password"
            type="text"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={shortPassword}
            aria-describedby="claim-password-hint"
          />
          <p id="claim-password-hint" className="text-[11.5px] text-ink-faint">
            At least {MIN_PASSWORD_LENGTH} characters. Shown as you type, because nobody else is looking at your screen
            during setup.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="claim-email">
            Recovery email <span className="font-normal text-ink-faint">— owner only</span>
          </Label>
          <Input
            id="claim-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@gmail.com"
            value={recoveryEmail}
            onChange={(e) => setRecoveryEmail(e.target.value)}
            aria-invalid={Boolean(emailProblem)}
            aria-describedby={emailProblem ? 'claim-email-error' : 'claim-email-hint'}
          />
          {emailProblem ? (
            <p id="claim-email-error" role="alert" className="text-[12px] text-red-500">
              {emailProblem}
            </p>
          ) : (
            <p id="claim-email-hint" className="text-[11.5px] leading-relaxed text-ink-faint">
              Strongly recommended. Yours is the one account nobody else can reset — without an address here, a
              forgotten password means repairing the project by hand. Your staff never need one.
            </p>
          )}
        </div>

        {phase.at === 'error' && (
          <p role="alert" className="surface rounded-2xl p-3 text-[12.5px] leading-relaxed text-ink">
            {phase.message}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full gap-2" disabled={!canSubmit}>
          {phase.at === 'signing' ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          Create the owner account
        </Button>
      </form>
    </>
  )
}

/**
 * Turns a sign-up failure into something a person can act on.
 *
 * The one that actually bit: Supabase tries to send a confirmation email when
 * "Confirm email" is on. Login IDs map to a domain that receives no mail, so
 * that message goes nowhere and the built-in SMTP allowance — a handful an
 * hour — is spent for nothing. The raw error is "email rate limit exceeded",
 * which describes the symptom and hides the cause completely.
 *
 * There is nothing the browser can do about it: the fix is one setting on the
 * project. So the message names the setting rather than suggesting a retry
 * that would fail the same way.
 */
function describeSignUpError(raw: string): string {
  const text = raw.toLowerCase()

  if (text.includes('rate limit') || text.includes('email rate')) {
    return (
      'Supabase tried to send a confirmation email and ran out of its allowance. ' +
      'Login IDs have no real mailbox, so no confirmation should be sent at all. ' +
      'Turn off Authentication → Sign In / Providers → Email → "Confirm email" in Supabase, then try again.'
    )
  }
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'That login ID is already taken. Pick another.'
  }
  if (text.includes('signups not allowed') || text.includes('signup is disabled')) {
    return 'Sign-ups are turned off for this project. Enable them in Supabase, or ask an existing owner to create the account.'
  }
  return raw
}
