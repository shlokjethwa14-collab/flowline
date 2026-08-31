import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from './database.types'
import { hasSupabaseConfig, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

/** Routes that never require a session. */
const PUBLIC_PATHS = ['/welcome', '/login', '/auth/callback', '/auth/sign-out']

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Refreshes the Supabase session cookie on every request and keeps signed-out
 * visitors away from the app. In demo mode there is no session to refresh, so
 * every route is allowed through.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  if (!hasSupabaseConfig()) {
    // Demo mode: /login has nothing to do, so send people to the app.
    // /welcome is left alone — the landing story is public either way, and
    // it is the only way to see it when there is no Supabase project.
    if (request.nextUrl.pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // getUser() revalidates the token with Supabase — do not swap this for
  // getSession(), which trusts whatever is in the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
