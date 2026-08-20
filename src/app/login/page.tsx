'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2, Mail, ShieldCheck, UserRound, Waves } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { GlassStack } from '@/components/shared/glass-stack'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { friendlyError } from '@/lib/data/api'
import { getBrowserClient } from '@/lib/supabase/client'
import { signInSchema, type SignInValues } from '@/lib/validators'

function RolePoint({
  icon: Icon,
  title,
  points,
}: {
  icon: typeof ShieldCheck
  title: string
  points: string[]
}) {
  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-white to-zinc-100 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_2px_5px_rgba(24,24,27,.06)]">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <h3 className="text-[13.5px] font-semibold text-zinc-900">{title}</h3>
      </div>
      <ul className="mt-3 space-y-1.5">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-zinc-500">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            {point}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function LoginPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '' },
    mode: 'onChange',
  })

  const onSubmit = form.handleSubmit(async (values) => {
    const supabase = getBrowserClient()
    if (!supabase) {
      toast.error('Supabase is not configured, so there is nothing to sign in to.')
      return
    }
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: values.email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          // Nobody is created by signing in — an admin adds people first.
          shouldCreateUser: false,
        },
      })
      if (error) throw new Error(error.message)
      setSentTo(values.email.trim())
      toast.success('Check your email.', { description: 'We sent you a link that signs you straight in.' })
    } catch (error) {
      toast.error(friendlyError(error))
    }
  })

  return (
    <main className="depth-scene flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center">
        {/* Left: what Flowline is */}
        <section className="relative order-2 space-y-5 lg:order-1">
          <GlassStack className="absolute -left-24 -top-16 -z-10 hidden h-[380px] w-[560px] opacity-70 lg:block" />

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(250_84%_68%)] to-[hsl(250_84%_54%)] text-white shadow-[0_2px_5px_rgba(24,24,27,.1),0_10px_26px_-8px_rgba(109,88,240,.6),inset_0_1px_0_rgba(255,255,255,.4)]">
                <Waves className="h-6 w-6" strokeWidth={2.2} />
              </div>
              <div>
                <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em] text-zinc-900">Flowline</h1>
                <p className="mt-1.5 text-[13px] text-zinc-500">Daily work, kept simple</p>
              </div>
            </div>
            <p className="max-w-lg text-[14.5px] leading-relaxed text-zinc-600 text-pretty">
              One place for production planning, stock checks, sales visits, customer calls and the daily entries — with
              an evening report that tells you exactly how the day went.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <RolePoint
              icon={ShieldCheck}
              title="If you are the employer"
              points={[
                'See the whole company on one chart',
                'Give work to anyone in a few taps',
                'Read the evening report every night',
              ]}
            />
            <RolePoint
              icon={UserRound}
              title="If you are an employee"
              points={[
                'Open “My Day” and just work down the list',
                'Tick off the steps as you finish them',
                'Pass work on when you must — with a reason',
              ]}
            />
          </div>
        </section>

        {/* Right: sign in */}
        <section className="order-1 lg:order-2">
          <div className="glass glass-thick glass-iris rounded-3xl p-6 sm:p-7">
            {sentTo ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600 shadow-[inset_0_1px_0_rgba(255,255,255,.95),0_2px_6px_rgba(24,24,27,.07)]">
                  <Mail className="h-6 w-6" strokeWidth={1.9} />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-zinc-900">Check your email</h2>
                  <p className="text-[13.5px] leading-relaxed text-zinc-500 text-pretty">
                    We sent a sign-in link to <span className="font-medium text-zinc-700">{sentTo}</span>. Open it on
                    this device and you are in — no password to remember.
                  </p>
                </div>
                <Button variant="glass" className="w-full" onClick={() => setSentTo(null)}>
                  Use a different email
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-zinc-900">Sign in</h2>
                  <p className="text-[13.5px] leading-relaxed text-zinc-500">
                    Enter your work email and we will send you a link. There is no password to remember.
                  </p>
                </div>

                <form onSubmit={onSubmit} className="mt-5 space-y-3">
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
                      {...form.register('email')}
                    />
                    {form.formState.errors.email && (
                      <p role="alert" className="text-[12px] text-red-600">
                        {form.formState.errors.email.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full gap-2"
                    disabled={form.formState.isSubmitting || !form.formState.isValid}
                  >
                    {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Mail />}
                    Send me a sign-in link
                  </Button>
                </form>

                <p className="mt-4 text-[11.5px] leading-relaxed text-zinc-400">
                  What you can see and do is decided by your profile in the company database — not by anything sent from
                  this page.
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
