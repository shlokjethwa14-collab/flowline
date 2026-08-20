import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'
import { hasSupabaseConfig, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

export type TypedServerClient = ReturnType<typeof createServerClient<Database>>

/**
 * Server Supabase client bound to the request cookie jar. Returns null in
 * demo mode.
 *
 * Note: this uses the anon key plus the user's session, so Row Level Security
 * applies exactly as it does in the browser. Nothing here bypasses RLS.
 */
export function getServerClient(): TypedServerClient | null {
  if (!hasSupabaseConfig()) return null
  const cookieStore = cookies()

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  })
}

/** The signed-in user's profile, or null when signed out or in demo mode. */
export async function getServerProfile(): Promise<Database['public']['Tables']['profiles']['Row'] | null> {
  const supabase = getServerClient()
  if (!supabase) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  return data ?? null
}
