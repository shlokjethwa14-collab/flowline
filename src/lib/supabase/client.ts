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
