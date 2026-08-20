import { NextResponse, type NextRequest } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { hasSupabaseConfig } from '@/lib/supabase/env'
import { getServerClient, getServerProfile } from '@/lib/supabase/server'
import { addEmployeeSchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Invites a teammate and files them under a manager.
 *
 * Two independent checks stand between a caller and this doing anything:
 *   1. The caller must have a valid session AND an `admin` profile row.
 *   2. The role written to the profile comes from this validated body only —
 *      never from anything the invited person can influence.
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return fail('Supabase is not configured on this deployment.', 400)
  }

  const supabase = getServerClient()
  if (!supabase) return fail('Supabase is not configured on this deployment.', 400)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Please sign in again.', 401)

  const caller = await getServerProfile()
  if (!caller || caller.role !== 'admin') {
    return fail('Only the owner can add teammates.', 403)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('That request could not be read.', 400)
  }

  const parsed = addEmployeeSchema.safeParse(body)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Please check the details and try again.', 422)
  }
  const input = parsed.data

  const admin = getAdminClient()
  if (!admin) {
    return fail(
      'Adding teammates needs SUPABASE_SERVICE_ROLE_KEY on the server. Add it to your environment and restart.',
      500,
    )
  }

  // Send the sign-in invitation. An existing user is not an error — we just
  // update their profile instead of creating a second account.
  let userId: string | null = null
  const origin = request.nextUrl.origin
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: `${origin}/auth/callback`,
  })

  if (inviteError) {
    const alreadyExists = /already been registered|already exists|email_exists/i.test(inviteError.message)
    if (!alreadyExists) {
      return fail(inviteError.message, 400)
    }
    const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (listError) return fail(listError.message, 500)
    userId = list.users.find((u) => u.email?.toLowerCase() === input.email.toLowerCase())?.id ?? null
    if (!userId) return fail('That email is already registered but the account could not be found.', 409)
  } else {
    userId = invited.user?.id ?? null
  }

  if (!userId) return fail('The account could not be created.', 500)

  // The handle_new_user trigger already made a bare profile row; fill it in.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .upsert(
      {
        id: userId,
        full_name: input.full_name,
        job_title: input.job_title,
        reports_to: input.reports_to,
        role: input.role,
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single()

  if (profileError) return fail(profileError.message, 500)

  return NextResponse.json({ profile })
}
