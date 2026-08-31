'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { pageVariants, stillVariants } from '@/lib/motion'

/**
 * Cross-fades page bodies on navigation.
 *
 * Keyed on pathname so each route is a distinct element and `AnimatePresence`
 * can run an exit. `mode="wait"` prevents the old and new page overlapping,
 * which on a glass UI would briefly stack two blurred layers and look like a
 * rendering fault.
 *
 * Scroll is reset explicitly. Next restores scroll on its own for back and
 * forward, but a fresh forward navigation into a long board otherwise starts
 * halfway down the previous page's scroll position.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const reduced = useReducedMotion()

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={reduced ? stillVariants : pageVariants}
        initial="hidden"
        animate="show"
        exit="exit"
        // A transformed ancestor makes `position: fixed` descendants resolve
        // against it instead of the viewport, which would break the sheets
        // and dialogs. Dropping the transform once settled avoids that.
        onAnimationComplete={(definition) => {
          if (definition === 'show') {
            const el = document.getElementById('page-body')
            if (el) el.style.transform = 'none'
          }
        }}
        id="page-body"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
