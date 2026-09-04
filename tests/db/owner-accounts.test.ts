import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asServiceRole, asUser, createTestDatabase, dropTestDatabase, expectRejected, IDS } from './harness'

/**
 * Owner accounts.
 *
 * The invariant under test is that a workspace always has at least one owner.
 * Everything an owner can do to roles is allowed to fail safely except the
 * one move that has no way back: removing the last of them.
 */

let db: Client

beforeAll(async () => {
  db = await createTestDatabase('owneraccounts')
}, 120_000)

afterAll(async () => {
  await dropTestDatabase(db)
})

beforeEach(async () => {
  // The harness seeds two admins and two employees; restore that shape.
  await asServiceRole(db, () =>
    db.query(`update public.profiles set role='admin' where id = any($1)`, [[IDS.owner, IDS.admin2]]),
  )
  await asServiceRole(db, () =>
    db.query(`update public.profiles set role='employee' where id = any($1)`, [[IDS.employee, IDS.otherEmployee]]),
  )
})

describe('claiming an empty workspace', () => {
  it('is unclaimed only while nobody exists', async () => {
    const claimed = await db.query('select public.workspace_is_unclaimed() as unclaimed')
    expect(claimed.rows[0].unclaimed).toBe(false)

    // Emptying it flips the answer back — and this is the only state in which
    // self-registration is permitted.
    await asServiceRole(db, () => db.query('alter table public.profiles disable trigger profiles_protect_last_admin'))
    await asServiceRole(db, () => db.query('delete from public.profiles'))
    const empty = await db.query('select public.workspace_is_unclaimed() as unclaimed')
    expect(empty.rows[0].unclaimed).toBe(true)

    // Put it back for the remaining tests.
    await asServiceRole(db, () =>
      db.query(
        `insert into public.profiles (id, role, full_name) values
           ($1,'admin','Owner'), ($2,'admin','Second Admin'),
           ($3,'employee','Employee'), ($4,'employee','Other Employee')`,
        [IDS.owner, IDS.admin2, IDS.employee, IDS.otherEmployee],
      ),
    )
    await asServiceRole(db, () => db.query('alter table public.profiles enable trigger profiles_protect_last_admin'))
  })

  it('is readable without being signed in, so the sign-in screen can ask', async () => {
    const result = await asUser(db, null, () => db.query('select public.workspace_is_unclaimed() as unclaimed'))
    expect(typeof result.rows[0].unclaimed).toBe('boolean')
  })
})

describe('multiple owners', () => {
  it('an owner can promote an employee', async () => {
    await asUser(db, IDS.owner, () =>
      db.query('select public.set_person_role($1, $2)', [IDS.employee, 'admin']),
    )
    const role = await db.query('select role::text from public.profiles where id=$1', [IDS.employee])
    expect(role.rows[0].role).toBe('admin')
  })

  it('an employee cannot promote themselves', async () => {
    const message = await expectRejected(() =>
      asUser(db, IDS.employee, () => db.query('select public.set_person_role($1, $2)', [IDS.employee, 'admin'])),
    )
    expect(message).toMatch(/owner|admin/i)

    const role = await db.query('select role::text from public.profiles where id=$1', [IDS.employee])
    expect(role.rows[0].role).toBe('employee')
  })

  it('one owner can demote another while a second remains', async () => {
    await asUser(db, IDS.owner, () => db.query('select public.set_person_role($1, $2)', [IDS.admin2, 'employee']))
    const role = await db.query('select role::text from public.profiles where id=$1', [IDS.admin2])
    expect(role.rows[0].role).toBe('employee')
  })
})

describe('the last owner', () => {
  beforeEach(async () => {
    // Leave exactly one owner standing.
    await asServiceRole(db, () => db.query(`update public.profiles set role='employee' where id=$1`, [IDS.admin2]))
  })

  it('cannot demote themselves', async () => {
    const message = await expectRejected(() =>
      asUser(db, IDS.owner, () => db.query('select public.set_person_role($1, $2)', [IDS.owner, 'employee'])),
    )
    expect(message).toMatch(/only owner/i)

    const role = await db.query('select role::text from public.profiles where id=$1', [IDS.owner])
    expect(role.rows[0].role).toBe('admin')
  })

  it('cannot be demoted by a direct update either', async () => {
    // The trigger, not the RPC, is what actually guarantees this.
    const message = await expectRejected(() =>
      asServiceRole(db, () => db.query(`update public.profiles set role='employee' where id=$1`, [IDS.owner])),
    )
    expect(message).toMatch(/only owner/i)
  })

  it('cannot be deleted', async () => {
    const message = await expectRejected(() =>
      asServiceRole(db, () => db.query('delete from public.profiles where id=$1', [IDS.owner])),
    )
    expect(message).toMatch(/only owner/i)
  })

  it('can step down once someone else is made an owner', async () => {
    await asUser(db, IDS.owner, () => db.query('select public.set_person_role($1, $2)', [IDS.employee, 'admin']))
    await asUser(db, IDS.owner, () => db.query('select public.set_person_role($1, $2)', [IDS.owner, 'employee']))

    const roles = await db.query(`select count(*)::int n from public.profiles where role='admin'`)
    expect(roles.rows[0].n).toBe(1)
  })
})

describe('email addresses', () => {
  it('a person can read their own', async () => {
    const result = await asUser(db, IDS.employee, () => db.query('select public.email_for($1) as email', [IDS.employee]))
    expect(result.rows[0].email).toBe('employee@test.local')
  })

  it('an employee cannot read anyone else’s', async () => {
    const message = await expectRejected(() =>
      asUser(db, IDS.employee, () => db.query('select public.email_for($1)', [IDS.owner])),
    )
    expect(message).toMatch(/only see your own/i)
  })

  it('an owner can read everyone’s', async () => {
    const result = await asUser(db, IDS.owner, () => db.query('select public.email_for($1) as email', [IDS.employee]))
    expect(result.rows[0].email).toBe('employee@test.local')
  })
})

describe('verification', () => {
  it('reports an unverified address as unverified', async () => {
    await asServiceRole(db, () => db.query('update auth.users set email_confirmed_at = null where id=$1', [IDS.employee]))
    const result = await asUser(db, IDS.employee, () => db.query('select public.email_is_verified() as ok'))
    expect(result.rows[0].ok).toBe(false)
  })

  it('reports a verified address as verified', async () => {
    await asServiceRole(db, () => db.query('update auth.users set email_confirmed_at = now() where id=$1', [IDS.employee]))
    const result = await asUser(db, IDS.employee, () => db.query('select public.email_is_verified() as ok'))
    expect(result.rows[0].ok).toBe(true)
  })

  it('an employee cannot inspect someone else’s verification state', async () => {
    const message = await expectRejected(() =>
      asUser(db, IDS.employee, () => db.query('select public.email_is_verified($1)', [IDS.owner])),
    )
    expect(message).toMatch(/only see your own/i)
  })
})
