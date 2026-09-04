'use client'

import { ArrowLeft, Home, Waves } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/**
 * The 404.
 *
 * Previously this was Next's default, which is a bare message and no way
 * onward — someone who mistyped an address, or followed a stale link from a
 * report, had nothing to do but edit the URL. Both exits are offered: Back
 * for a wrong turn, Home for a stale link where going back returns to the
 * same dead end.
 */
export default function NotFound() {
  const router = useRouter()

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(250_84%_68%)] to-[hsl(250_84%_54%)] text-white shadow-[0_8px_28px_-6px_rgba(109,88,240,.6)]">
          <Waves className="h-6 w-6" strokeWidth={2.2} />
        </div>

        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">This page does not exist</h1>
        <p className="mx-auto mt-2 max-w-sm text-pretty text-[14px] leading-relaxed text-ink-muted">
          The address may be mistyped, or the work it pointed to may have been finished and cleared.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild className="gap-2">
            <Link href="/">
              <Home className="h-4 w-4" />
              Go home
            </Link>
          </Button>
          {/* router.back() rather than a link: the previous page is wherever
              they actually came from, which a fixed href cannot know. */}
          <Button variant="glass" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Go back
          </Button>
        </div>
      </div>
    </main>
  )
}
