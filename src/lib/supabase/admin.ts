import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { SUPABASE_URL } from './env'

/**
 * Service-role client. Bypasses Row Level Security, so it must never be
 * imported from anything that reaches the browser — the `server-only` import
 * above turns any such attempt into a build error.
 *
 * The key is read from SUPABASE_SERVICE_ROLE_KEY, which has no NEXT_PUBLIC_
 * prefix and is therefore never inlined into client bundles.
 */
export function getAdminClient(): SupabaseClient<Database> | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!SUPABASE_URL || !serviceKey) return null

  return createClient<Database>(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
