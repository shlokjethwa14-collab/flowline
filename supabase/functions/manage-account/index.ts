/**
 * Creating accounts and setting passwords.
 *
 * This lives in a Supabase Edge Function for one reason: both operations need
 * the service role key, which bypasses row level security entirely. That key
 * can never reach a browser bundle, and the site is served statically with no
 * server of its own — so this is the only place it can safely live.
 *
 * It never hashes or stores a password. Everything is handed to Supabase
 * Auth's own admin API, which salts and hashes properly; a password exists
 * here only as a local variable on its way there, and is never logged, echoed
 * back, or written to any table.
 *
 * Deploy:
 *   supabase functions deploy manage-account --project-ref <ref>
 * The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY variables are provided by
 * the platform; nothing needs configuring by hand.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

/**
 * Login IDs become the local part of an address on this domain. It is never
 * used for mail — it exists so Supabase Auth, which requires an email, has a
 * unique and syntactically valid one to key the account on.
 */
const ACCOUNT_DOMAIN = 'accounts.ckltask.com'

/** Matches the CHECK constraint in migration 0014. Kept in step by hand. */
const LOGIN_ID = /^[a-z0-9][a-z0-9._-]{2,30}$/

/**
 * Long enough that it cannot be guessed, short enough to read aloud across a
 * factory floor. Supabase's own minimum is 6, which is not enough for a
 * credential somebody else chooses on your behalf.
 */
const MIN_PASSWORD = 10

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function emailFor(loginId: string): string {
  return `${loginId}@${ACCOUNT_DOMAIN}`
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = request.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Sign in first.' }, 401)
  }

  /*
   * Two clients, deliberately.
   *
   * `caller` runs as whoever made the request and is used only to find out
   * who they are. `admin` holds the service role and does the privileged
   * work. Mixing them is how these functions usually end up doing privileged
   * work on behalf of someone who was never checked.
   */
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: me, error: meError } = await caller.auth.getUser()
  if (meError || !me?.user) return json({ error: 'That session is not valid.' }, 401)

  /*
   * The role is read from the database, never from the token. A JWT is issued
   * once and lives for an hour; someone demoted thirty seconds ago still
   * carries a token that says otherwise.
   */
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', me.user.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    return json({ error: 'Only an owner can manage accounts.' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json({ error: 'That request was not readable.' }, 400)
  }

  const action = String(body.action ?? '')

  // --- Create an account ------------------------------------------------
  if (action === 'create') {
    const loginId = String(body.login_id ?? '').trim().toLowerCase()
    const fullName = String(body.full_name ?? '').trim()
    const jobTitle = String(body.job_title ?? '').trim()
    const role = body.role === 'admin' ? 'admin' : 'employee'
    const password = String(body.password ?? '')

    if (!LOGIN_ID.test(loginId)) {
      return json(
        {
          error:
            'A login ID is 3 to 31 characters: lowercase letters, numbers, dot, underscore or hyphen, starting with a letter or number.',
        },
        400,
      )
    }
    if (fullName.length < 2) return json({ error: 'Give the person a name.' }, 400)
    if (password.length < MIN_PASSWORD) {
      return json({ error: `A password needs at least ${MIN_PASSWORD} characters.` }, 400)
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: emailFor(loginId),
      password,
      // There is no mailbox to confirm. The owner handing the credential over
      // in person is what stands in for verification here.
      email_confirm: true,
      user_metadata: { full_name: fullName, job_title: jobTitle, login_id: loginId },
    })

    if (createError || !created?.user) {
      const already = /already|duplicate|registered/i.test(createError?.message ?? '')
      return json(
        { error: already ? 'That login ID is already taken.' : (createError?.message ?? 'The account could not be created.') },
        already ? 409 : 400,
      )
    }

    /*
     * handle_new_user() has already written the profile row from the trigger
     * on auth.users. This fills in what the trigger cannot know, and if it
     * fails the half-made account is removed rather than left as a login with
     * no login ID attached.
     */
    const { error: profileWriteError } = await admin
      .from('profiles')
      .update({ login_id: loginId, full_name: fullName, job_title: jobTitle || null, role })
      .eq('id', created.user.id)

    if (profileWriteError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: `The account was rolled back: ${profileWriteError.message}` }, 400)
    }

    return json({ ok: true, user_id: created.user.id, login_id: loginId })
  }

  // --- Set a password ---------------------------------------------------
  if (action === 'set_password') {
    const userId = String(body.user_id ?? '')
    const password = String(body.password ?? '')

    if (!userId) return json({ error: 'Which account?' }, 400)
    if (password.length < MIN_PASSWORD) {
      return json({ error: `A password needs at least ${MIN_PASSWORD} characters.` }, 400)
    }

    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) return json({ error: error.message }, 400)

    return json({ ok: true })
  }

  // --- Change a login ID ------------------------------------------------
  if (action === 'set_login_id') {
    const userId = String(body.user_id ?? '')
    const loginId = String(body.login_id ?? '').trim().toLowerCase()

    if (!userId) return json({ error: 'Which account?' }, 400)
    if (!LOGIN_ID.test(loginId)) return json({ error: 'That login ID is not allowed.' }, 400)

    // The address and the profile must move together, or the person types the
    // new ID and Auth still keys them on the old one.
    const { error: emailError } = await admin.auth.admin.updateUserById(userId, {
      email: emailFor(loginId),
      email_confirm: true,
    })
    if (emailError) {
      const taken = /already|duplicate|registered/i.test(emailError.message)
      return json({ error: taken ? 'That login ID is already taken.' : emailError.message }, taken ? 409 : 400)
    }

    const { error: profileError2 } = await admin.from('profiles').update({ login_id: loginId }).eq('id', userId)
    if (profileError2) return json({ error: profileError2.message }, 400)

    return json({ ok: true, login_id: loginId })
  }

  return json({ error: `Unknown action: ${action}` }, 400)
})
