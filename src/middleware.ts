import type { NextRequest } from 'next/server'
import { buildCsp, createNonce, STATIC_SECURITY_HEADERS } from '@/lib/security-headers'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Note: this file must live in `src/`, alongside `app/`. A middleware.ts at
 * the repository root is silently ignored in a `src/` project.
 */
export async function middleware(request: NextRequest) {
  const nonce = createNonce()
  const isDev = process.env.NODE_ENV !== 'production'
  const csp = buildCsp(nonce, isDev)

  /*
   * The nonce reaches the rendered page through a request header rather than
   * a cookie or a context: Next reads `x-nonce` itself and stamps it onto the
   * script tags it injects. Without this the framework's own bootstrap code
   * would be blocked by our own policy.
   */
  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('Content-Security-Policy', csp)

  const response = await updateSession(request, headers)

  response.headers.set('Content-Security-Policy', csp)
  for (const [key, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Every path except Next internals and static files. Auth routes are
     * included on purpose so the session cookie is refreshed there too.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
