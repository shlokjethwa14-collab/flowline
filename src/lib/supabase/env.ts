/**
 * Flowline runs in one of two modes.
 *
 *  - Connected: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are
 *    set, so every read and write goes to PostgreSQL under Row Level Security.
 *  - Demo: those variables are missing, so the app serves a complete, fully
 *    interactive sample company from the browser. No sign-in, no network.
 *
 * The check is deliberately shared by the browser, the server and the
 * middleware so all three always agree about which mode is active.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ''

export function hasSupabaseConfig(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0 && SUPABASE_URL.startsWith('http')
}

/** True when the app should serve the built-in sample company. */
export const IS_DEMO = !hasSupabaseConfig()
