import { NextResponse, type NextRequest } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function signOut(request: NextRequest) {
  const supabase = await getServerClient()
  if (supabase) {
    await supabase.auth.signOut()
  }
  return NextResponse.redirect(new URL('/login', request.nextUrl.origin), { status: 303 })
}

export async function GET(request: NextRequest) {
  return signOut(request)
}

export async function POST(request: NextRequest) {
  return signOut(request)
}
