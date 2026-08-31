import type { Transition, Variants } from 'motion/react'

/**
 * One motion vocabulary for the whole app.
 *
 * Springs rather than durations: a spring keeps its velocity when it is
 * interrupted, so a card caught mid-lift continues from where it is instead
 * of snapping back and replaying. Damping is high on every one of these —
 * this is a factory tool, not a toy, and bouncy motion reads as unserious
 * the second time someone sees it.
 */

/** Small, immediate feedback: presses, toggles, chips. */
export const snap: Transition = { type: 'spring', stiffness: 520, damping: 34, mass: 0.6 }

/** Cards lifting, tiles settling, list items arriving. */
export const lift: Transition = { type: 'spring', stiffness: 320, damping: 32, mass: 0.9 }

/** Large surfaces: sheets, dialogs, page bodies. */
export const surface: Transition = { type: 'spring', stiffness: 210, damping: 30, mass: 1 }

/** Pointer-following depth. Softer, so tilt trails the cursor slightly. */
export const trail: Transition = { type: 'spring', stiffness: 180, damping: 22, mass: 0.7 }

/** Anything that must not overshoot — progress fills, sliding indicators. */
export const exact: Transition = { type: 'spring', stiffness: 400, damping: 40, mass: 0.8 }

/* ------------------------------------------------------------------ */
/* Variants                                                            */
/* ------------------------------------------------------------------ */

/**
 * A list that reveals its children in sequence.
 *
 * `staggerChildren` is deliberately small. Anything above ~0.05s on a
 * twenty-item board turns into a wave the user has to wait out.
 */
export const listContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
}

/** Rises and settles, with a touch of Z so it reads as depth not slide. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: lift },
}

/** Page bodies. Moves along Z so navigation feels like stepping forward. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.994 },
  show: { opacity: 1, y: 0, scale: 1, transition: surface },
  exit: { opacity: 0, y: -6, scale: 0.996, transition: { ...snap, damping: 40 } },
}

/** Overlays scale up from near-full size, never from tiny. */
export const overlayVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: surface },
  exit: { opacity: 0, scale: 0.97, y: 4, transition: { ...snap, damping: 40 } },
}

/**
 * Reduced-motion replacements.
 *
 * State still changes instantly — only the travel is removed. Returning
 * `undefined` transitions would leave Motion's defaults in place, so these
 * are explicit zero-duration tweens.
 */
export const still: Transition = { duration: 0 }

export const stillVariants: Variants = {
  hidden: { opacity: 1, y: 0, scale: 1 },
  show: { opacity: 1, y: 0, scale: 1, transition: still },
  exit: { opacity: 1, y: 0, scale: 1, transition: still },
}

/** How far a tilting card rotates at the edges, in degrees. */
export const TILT_DEGREES = 6
