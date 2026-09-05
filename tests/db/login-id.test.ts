import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asServiceRole, asUser, createTestDatabase, dropTestDatabase, IDS } from './harness'

/**
 * Signing in by login ID.
 *
 * Two defects made every account unreachable and both are covered here: the
 * profile trigger silently dropping the login ID, and sign-in deriving an
 * address from it rather than looking one up — which broke the moment an
 * owner registered with a real email instead of the synthetic form.
 */

let db: Client

async function makeUser(email: string, meta: Record<string, string> = {}): Promise<string> {
  const result = await asServiceRole(db, () =>
    db.query(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
      [email, JSON.stringify(meta)],
    ),
  )
  return result.rows[0].id
}

async function loginEmail(identifier: string): Promise<string | null> {
  const result = await db.query('select public.login_email($1) as email', [identifier])
  return result.rows[0].email
}

beforeAll(async () => {
  db = await createTestDatabase('loginid')
}, 120_000)

afterAll(async () => {
  await dropTestDatabase(db)
})

beforeEach(async () => {
  await asServiceRole(db, () =>
    db.query(`delete from auth.users where id <> all($1::uuid[])`, [
      [IDS.owner, IDS.admin2, IDS.employee, IDS.otherEmployee],
    ]),
  )
})

describe('the profile trigger', () => {
  it('stores the login ID given at sign-up', async () => {
    const id = await makeUser('suresh@accounts.ckltask.com', { full_name: 'Suresh Yadav', login_id: 'suresh' })
    const row = await db.query('select login_id::text, full_name from public.profiles where id=$1', [id])
    expect(row.rows[0].login_id).toBe('suresh')
    expect(row.rows[0].full_name).toBe('Suresh Yadav')
  })

  it('falls back to the local part when no login ID was supplied', async () => {
    const id = await makeUser('kavita@accounts.ckltask.com')
    const row = await db.query('select login_id::text from public.profiles where id=$1', [id])
    expect(row.rows[0].login_id).toBe('kavita')
  })

  it('still creates the account when the login ID is taken', async () => {
    await makeUser('taken@accounts.ckltask.com', { login_id: 'shared' })
    const second = await makeUser('other@accounts.ckltask.com', { login_id: 'shared' })

    // The account exists; it simply has no ID until an owner assigns one.
    const row = await db.query('select login_id::text from public.profiles where id=$1', [second])
    expect(row.rows[0].login_id).toBeNull()
  })
})

describe('resolving a login ID to an address', () => {
  it('finds the real address for an owner who used their own email', async () => {
    // The case that broke: identity is a gmail address, not the synthetic one.
    await makeUser('shlokjethwa14@gmail.com', { full_name: 'Shlok', login_id: 'shlok' })
    expect(await loginEmail('shlok')).toBe('shlokjethwa14@gmail.com')
  })

  it('finds the synthetic address for an ordinary employee', async () => {
    await makeUser('meena@accounts.ckltask.com', { login_id: 'meena' })
    expect(await loginEmail('meena')).toBe('meena@accounts.ckltask.com')
  })

  it('passes an address through unchanged', async () => {
    await makeUser('shlokjethwa14@gmail.com', { login_id: 'shlok' })
    expect(await loginEmail('shlokjethwa14@gmail.com')).toBe('shlokjethwa14@gmail.com')
  })

  it('is case and whitespace insensitive', async () => {
    await makeUser('arjun@accounts.ckltask.com', { login_id: 'arjun' })
    expect(await loginEmail('  ARJUN ')).toBe('arjun@accounts.ckltask.com')
  })

  it('answers for an unknown ID, so accounts cannot be enumerated', async () => {
    // The important property: indistinguishable from a real one. A caller
    // learns nothing until the password is checked.
    const unknown = await loginEmail('nobodyhasthisid')
    expect(unknown).toBe('nobodyhasthisid@accounts.ckltask.com')
    expect(unknown).not.toBeNull()
  })

  it('is callable before signing in', async () => {
    await makeUser('priya@accounts.ckltask.com', { login_id: 'priya' })
    const result = await asUser(db, null, () =>
      db.query('select public.login_email($1) as email', ['priya']),
    )
    expect(result.rows[0].email).toBe('priya@accounts.ckltask.com')
  })
})

describe('the backfill', () => {
  it('gives a login ID to a profile created before the trigger stored one', async () => {
    // Reproduce the broken shape: a profile whose login_id was dropped.
    const id = await makeUser('legacy@accounts.ckltask.com', { login_id: 'legacy' })
    await asServiceRole(db, () => db.query('update public.profiles set login_id = null where id=$1', [id]))

    await asServiceRole(db, () =>
      db.query(
        `update public.profiles p
         set login_id = coalesce(nullif(btrim(u.raw_user_meta_data ->> 'login_id'), ''),
                                 lower(split_part(u.email, '@', 1)))::citext
         from auth.users u
         where u.id = p.id and p.login_id is null and u.email is not null
           and not exists (select 1 from public.profiles q where q.login_id = coalesce(
                 nullif(btrim(u.raw_user_meta_data ->> 'login_id'), ''),
                 lower(split_part(u.email, '@', 1)))::citext)`,
      ),
    )

    const row = await db.query('select login_id::text from public.profiles where id=$1', [id])
    expect(row.rows[0].login_id).toBe('legacy')
    expect(await loginEmail('legacy')).toBe('legacy@accounts.ckltask.com')
  })
})
