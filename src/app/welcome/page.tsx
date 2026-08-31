'use client'

import { ArrowRight, Waves } from 'lucide-react'
import Link from 'next/link'
import { motion, useScroll, useSpring } from 'motion/react'
import { SmoothScroll } from '@/components/motion/smooth-scroll'
import { PhotoScatter, type ScatterPhoto } from '@/components/story/photo-scatter'
import { ActBody, ActHeadline, ActLabel, StoryAct } from '@/components/story/story-act'
import { StoryField } from '@/components/story/story-field'
import { Button } from '@/components/ui/button'

/**
 * Flowline's public front door.
 *
 * A single scroll narrative, in the manner of a product launch site: one
 * pinned WebGL field the whole document travels past, photographs thrown
 * across the viewport at varying depths, and acts that fade through one at a
 * time.
 *
 * This format earns its keep here and nowhere else in the product. The
 * working screens behind the sign-in are dense and fast on purpose — someone
 * checking a fabric lot at four in the afternoon is not on a journey.
 */

/*
 * Scatter positions follow two rules learned the hard way.
 *
 * `x` stays outside 22–78%: the pinned copy is `max-w-3xl` and centred, so
 * anything inside that band lands on top of a headline.
 *
 * `y` stays inside 15–60%: the act is a tall scroll region with a pinned
 * middle, so only the band that passes the viewport during the hold is ever
 * seen. Photos placed near the top or bottom of the container scroll by
 * while the reader is looking at something else.
 */
const PRODUCTION: ScatterPhoto[] = [
  { src: '/story/threads.webp', alt: '', x: 2, y: 22, width: 215, rotate: -7, depth: 1.4 },
  { src: '/story/fabric.webp', alt: '', x: 79, y: 15, width: 235, rotate: 6, depth: 0.7 },
  { src: '/story/spools.webp', alt: '', x: 80, y: 50, width: 190, rotate: -4, depth: 1.9 },
]

const FLOOR: ScatterPhoto[] = [
  { src: '/story/floor.webp', alt: '', x: 78, y: 20, width: 240, rotate: 5, depth: 1.1 },
  { src: '/story/stockcheck.webp', alt: '', x: 1, y: 44, width: 225, rotate: -6, depth: 1.7 },
]

const PEOPLE: ScatterPhoto[] = [
  { src: '/story/call.webp', alt: '', x: 2, y: 18, width: 230, rotate: 4, depth: 1.3 },
  { src: '/story/meeting.webp', alt: '', x: 79, y: 42, width: 235, rotate: -5, depth: 0.8 },
  { src: '/story/entry.webp', alt: '', x: 4, y: 55, width: 180, rotate: 8, depth: 2 },
]

/** Thin progress rail, so the reader can see how much story is left. */
function ScrollRail() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 40, mass: 0.4 })

  return (
    <motion.div
      className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-primary"
      style={{ scaleX }}
      aria-hidden="true"
    />
  )
}

export default function WelcomePage() {
  return (
    <main className="relative">
      <SmoothScroll />
      <StoryField />
      <ScrollRail />

      {/* Fixed chrome. Sign in is reachable from any point in the story —
          nobody should have to scroll 12 screens to find the door. */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-5 py-4 sm:px-8">
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(250_84%_68%)] to-[hsl(250_84%_54%)] text-white shadow-[0_6px_18px_-6px_rgba(109,88,240,.7)]">
            <Waves className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Flowline</span>
        </span>
        <Button asChild variant="glass" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>

      {/* Everything below rides above the field. See StoryField for why the
          field is z-0 rather than a negative index. */}
      <div className="relative z-10">
      {/* Act 1 — the opening claim */}
      <StoryAct length={2.2} opening>
        <ActHeadline>
          Every day, work gets decided
          <br />
          in a hundred small messages.
        </ActHeadline>
        <ActBody>
          A call at the dyeing unit. A note on a register. Something the supervisor remembers. By evening nobody can say
          what actually got done.
        </ActBody>
      </StoryAct>

      {/* Act 2 — production, with the fabric scatter behind it */}
      <div className="relative">
        <PhotoScatter photos={PRODUCTION} className="absolute inset-0 h-full" />
        <StoryAct length={2.4}>
          <ActLabel>Production</ActLabel>
          <ActHeadline>The lot slipped. Who knew, and when?</ActHeadline>
          <ActBody>
            Flowline holds the plan, the checklist and the reason it moved — on the job itself, not in someone&rsquo;s
            head.
          </ActBody>
        </StoryAct>
      </div>

      {/* Act 3 — the floor */}
      <div className="relative">
        <PhotoScatter photos={FLOOR} className="absolute inset-0 h-full" />
        <StoryAct length={2.4}>
          <ActLabel>Stock &amp; the floor</ActLabel>
          <ActHeadline>
            Count the rolls once.
            <br />
            Everyone sees the number.
          </ActHeadline>
          <ActBody>
            Stock checks, machine runs and godown counts land as tickable steps. What is finished is finished, for
            everybody, at the same moment.
          </ActBody>
        </StoryAct>
      </div>

      {/* Act 4 — people and calls */}
      <div className="relative">
        <PhotoScatter photos={PEOPLE} className="absolute inset-0 h-full" />
        <StoryAct length={2.4}>
          <ActLabel>Calls &amp; visits</ActLabel>
          <ActHeadline>The date someone promised on a call is now a job on that date.</ActHeadline>
          <ActBody>
            Record the call, and Flowline reads it back: the commitments, the dates hidden inside them, and what the
            customer told you about your own business.
          </ActBody>
        </StoryAct>
      </div>

      {/* Act 5 — the evening report, the product's actual argument */}
      <StoryAct length={2.4}>
        <ActLabel>Every evening</ActLabel>
        <ActHeadline>
          One report.
          <br />
          What got done, what did not, why.
        </ActHeadline>
        <ActBody>
          Unfinished work rolls to tomorrow on its own. Nothing quietly disappears, and nobody has to chase seven people
          to find out how the day went.
        </ActBody>
      </StoryAct>

      {/* Close */}
      {/* Same overlap as the acts, so the closing panel rises into view while
          the last act is still fading rather than after a blank screen. */}
      <section className="relative -mt-[100dvh] flex min-h-dvh items-center justify-center px-5 pb-24">
        <div className="text-center">
          <h2 className="text-balance text-[clamp(2rem,6vw,4rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
            Daily work, kept simple.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-pretty text-[1.05rem] leading-relaxed text-ink-muted">
            Built for the people who run the floor, not for the people who buy software.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link href="/login">
                Sign in
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="glass" size="lg">
              <Link href="/my-day">See the demo</Link>
            </Button>
          </div>
          <p className="mt-16 text-[12px] text-ink-faint">Photographs licensed from Adobe Stock.</p>
        </div>
      </section>
      </div>
    </main>
  )
}
