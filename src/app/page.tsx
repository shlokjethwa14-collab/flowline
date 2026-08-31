'use client'

import { Waves } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { homeFor } from '@/components/shell/nav-items'
import { useCurrentUser } from '@/hooks/use-flowline'

/**
 * Everyone lands here first and is sent on: signed-in people to the right home
 * screen (the owner to Team Flow, everyone else to My Day), and anyone else to
 * the landing story.
 */
export default function IndexPage() {
  const router = useRouter()
  const { profile, isLoading, isDemo } = useCurrentUser()

  useEffect(() => {
    if (isLoading) return
    if (profile) {
      router.replace(homeFor(profile.role))
      return
    }
    // Nobody signed in: the landing story, not the sign-in form. Someone who
    // has never seen Flowline needs to know what it is before being asked
    // for an email address.
    if (!isDemo) router.replace('/welcome')
  }, [isLoading, profile, isDemo, router])

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-14 w-14 animate-float items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(250_84%_68%)] to-[hsl(250_84%_54%)] text-white shadow-[0_8px_28px_-6px_rgba(109,88,240,.6),inset_0_1px_0_rgba(255,255,255,.4)]">
          <Waves className="h-6 w-6" strokeWidth={2.2} />
        </div>
        <p className="text-[14px] font-medium text-zinc-500">Opening Flowline…</p>
      </div>
    </div>
  )
}
