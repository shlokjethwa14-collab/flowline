'use client'

import * as React from 'react'
import { probeAi, type AiStatus } from '@/lib/ai/availability'

/**
 * The AI's availability, for disabling a control before it is pressed.
 *
 * Starts in `checking` so a control can render disabled-but-neutral rather
 * than flashing "unavailable" and then becoming usable a moment later.
 */
export function useAiStatus(): AiStatus {
  const [status, setStatus] = React.useState<AiStatus>({ state: 'checking' })

  React.useEffect(() => {
    let cancelled = false
    probeAi().then((next) => {
      if (!cancelled) setStatus(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return status
}
