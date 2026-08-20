import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Note: this file must live in `src/`, alongside `app/`. A middleware.ts at
 * the repository root is silently ignored in a `src/` project.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request)
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
