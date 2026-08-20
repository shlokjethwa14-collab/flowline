import { NextResponse, type NextRequest } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Where the emailed sign-in link lands. Exchanges the one-time code for a
 * session cookie, then sends the person into the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const errorDescription = searchParams.get('error_description')

  if (errorDescription) {
    const url = new URL('/login', origin)
    url.searchParams.set('error', errorDescription)
    return NextResponse.redirect(url)
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login', origin))
  }

  const supabase = getServerClient()
  if (!supabase) {
    // Demo mode has no sessions to exchange.
    return NextResponse.redirect(new URL('/', origin))
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    const url = new URL('/login', origin)
    url.searchParams.set('error', 'That sign-in link has expired. Please request a new one.')
    return NextResponse.redirect(url)
  }

  // Only ever redirect to a path on this site.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  return NextResponse.redirect(new URL(safeNext, origin))
}
