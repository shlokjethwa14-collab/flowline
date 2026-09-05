import { NextResponse, type NextRequest } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { hasSupabaseConfig } from '@/lib/supabase/env'
import { getServerClient, getServerProfile } from '@/lib/supabase/server'
import { ACCOUNT_DOMAIN } from '@/lib/accounts'
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

  const supabase = await getServerClient()
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

  /*
   * Create the account outright rather than emailing an invitation.
   *
   * `inviteUserByEmail` posted a link to an address the person had to own.
   * Nobody on a factory floor has a work email, so that link went to a made-up
   * address, was never opened, and — once login IDs arrived — was sent to a
   * domain with no mailbox at all, which is what exhausted the project's mail
   * allowance and produced "email rate limit exceeded".
   *
   * `email_confirm: true` is what stops any mail being sent: the address is
   * marked verified at creation, because there is nothing to verify. The
   * owner handing over the credential in person is what stands in for it.
   */
  const loginId = input.login_id.trim().toLowerCase()
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: `${loginId}@${ACCOUNT_DOMAIN}`,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, job_title: input.job_title, login_id: loginId },
  })

  if (createError) {
    const taken = /already been registered|already exists|email_exists|duplicate/i.test(createError.message)
    return fail(taken ? 'That login ID is already taken.' : createError.message, taken ? 409 : 400)
  }

  const userId = created.user?.id ?? null

  if (!userId) return fail('The account could not be created.', 500)

  // The handle_new_user trigger already made a bare profile row; fill it in.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .upsert(
      {
        id: userId,
        full_name: input.full_name,
        job_title: input.job_title,
        login_id: input.login_id.trim().toLowerCase(),
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
