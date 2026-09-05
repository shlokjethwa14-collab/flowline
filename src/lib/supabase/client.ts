'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { hasSupabaseConfig, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

// Derived from the factory rather than written out, so the alias keeps working
// when supabase-js changes the arity of SupabaseClient's generics.
export type TypedSupabaseClient = ReturnType<typeof createBrowserClient<Database>>

let cached: TypedSupabaseClient | null = null

/**
 * Browser Supabase client. Only ever uses the public anon key — the
 * service-role key is never imported into anything that reaches the browser.
 *
 * Returns null in demo mode so callers fall through to the demo store.
 */
export function getBrowserClient(): TypedSupabaseClient | null {
  if (!hasSupabaseConfig()) return null
  if (cached) return cached
  cached = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)
  return cached
}

/** Same client, but throws instead of returning null. For connected-mode paths. */
export function requireBrowserClient(): TypedSupabaseClient {
  const client = getBrowserClient()
  if (!client) {
    throw new Error('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
  return client
}

/**
 * A throwaway client that signs someone up without touching the current
 * session.
 *
 * Creating a teammate normally needs the service role, which cannot exist in
 * a browser — so on a static deployment it needed a server, and there is
 * none. With confirmation emails turned off, an ordinary sign-up creates a
 * usable account immediately, which makes it possible from here after all.
 *
 * The catch is that `signUp` on the shared client would swap the owner's
 * session for the new employee's — the owner would find themselves signed in
 * as the person they just created. This client is configured to persist
 * nothing and refresh nothing, so the account is created and its session is
 * discarded, leaving the owner exactly where they were.
 *
 * It is deliberately not cached: one per call, used once, thrown away.
 */
export function createIsolatedClient(): TypedSupabaseClient | null {
  if (!hasSupabaseConfig()) return null
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // Without a distinct key it would still collide with the real session.
      storageKey: 'flowline.transient',
    },
  })
}
