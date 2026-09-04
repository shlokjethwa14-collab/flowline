'use client'

import * as React from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { IS_DEMO } from '@/lib/supabase/env'

/**
 * Whether this workspace still has nobody in it.
 *
 * The answer decides whether the owner sign-in offers to create the first
 * account. It is asked of the server rather than inferred in the browser,
 * because it is the gate on the only self-registration this app permits —
 * `workspace_is_unclaimed()` stops returning true the moment the first
 * profile row exists, so the gate closes by itself.
 *
 * `null` while unknown, so the form can render without briefly offering to
 * claim a workspace that is already claimed.
 */
export function useWorkspaceUnclaimed(): boolean | null {
  const [unclaimed, setUnclaimed] = React.useState<boolean | null>(IS_DEMO ? false : null)

  React.useEffect(() => {
    if (IS_DEMO) return

    let cancelled = false
    const supabase = getBrowserClient()
    if (!supabase) {
      // Deferred rather than set synchronously: a setState in the effect body
      // runs before the browser has painted, which cascades a second render
      // for a value that was already known at mount.
      queueMicrotask(() => {
        if (!cancelled) setUnclaimed(false)
      })
      return () => {
        cancelled = true
      }
    }
    supabase
      .rpc('workspace_is_unclaimed')
      .then(({ data, error }) => {
        if (cancelled) return
        // On error, assume claimed. Wrongly offering to create an owner is
        // the worse failure of the two.
        setUnclaimed(error ? false : Boolean(data))
      })

    return () => {
      cancelled = true
    }
  }, [])

  return unclaimed
}
