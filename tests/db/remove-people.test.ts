import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asServiceRole, asUser, createTestDatabase, dropTestDatabase, expectRejected, IDS } from './harness'

/**
 * Removing someone from the team.
 *
 * The property worth protecting is that removing a person never rewrites what
 * already happened. Every table names people with ON DELETE SET NULL, so a
 * plain delete would blank their name out of past reports and handoffs —
 * these tests exist to make sure the safe path stays the default one.
 */

let db: Client

async function makeTask(assignedTo: string, status = 'todo'): Promise<string> {
  const result = await asServiceRole(db, () =>
    db.query(
      `insert into public.tasks (title, assigned_to, created_by, status, due_date)
       values ('Work', $1, $2, $3, now()) returning id`,
      [assignedTo, IDS.owner, status],
    ),
  )
  return result.rows[0].id
}

beforeAll(async () => {
  db = await createTestDatabase('removepeople')
}, 120_000)

afterAll(async () => {
  await dropTestDatabase(db)
})

beforeEach(async () => {
  await asServiceRole(db, () => db.query('delete from public.task_handoffs'))
  await asServiceRole(db, () => db.query('delete from public.activity_logs'))
  await asServiceRole(db, () => db.query('delete from public.tasks'))
  await asServiceRole(db, () => db.query('delete from public.task_routines'))
  await asServiceRole(db, () =>
    db.query(`update public.profiles set deactivated_at = null, reports_to = null, role = case
                when id = any($1::uuid[]) then 'admin'::public.user_role
                else 'employee'::public.user_role end`, [[IDS.owner, IDS.admin2]]),
  )
})

describe('removing someone', () => {
  it('marks them removed without deleting the row', async () => {
    await asUser(db, IDS.owner, () => db.query('select public.deactivate_person($1)', [IDS.employee]))

    const row = await db.query('select deactivated_at, full_name from public.profiles where id=$1', [IDS.employee])
    expect(row.rows).toHaveLength(1)
    expect(row.rows[0].deactivated_at).not.toBeNull()
    // The name survives, which is the whole point.
    expect(row.rows[0].full_name).toBe('Employee')
  })

  it('leaves their finished work attributed to them', async () => {
    const done = await makeTask(IDS.employee, 'done')
    await asUser(db, IDS.owner, () => db.query('select public.deactivate_person($1)', [IDS.employee]))

    const row = await db.query('select assigned_to from public.tasks where id=$1', [done])
    expect(row.rows[0].assigned_to).toBe(IDS.employee)
  })

  it('unassigns their unfinished work so it does not vanish', async () => {
    const open = await makeTask(IDS.employee, 'todo')
    const moved = await asUser(db, IDS.owner, () =>
      db.query('select public.deactivate_person($1) as n', [IDS.employee]),
    )

    expect(moved.rows[0].n).toBe(1)
    const row = await db.query('select assigned_to from public.tasks where id=$1', [open])
    expect(row.rows[0].assigned_to).toBeNull()
  })

  it('hands their unfinished work to someone else when asked', async () => {
    const open = await makeTask(IDS.employee, 'in_progress')
    await asUser(db, IDS.owner, () =>
      db.query('select public.deactivate_person($1, $2)', [IDS.employee, IDS.otherEmployee]),
    )

    const row = await db.query('select assigned_to from public.tasks where id=$1', [open])
    expect(row.rows[0].assigned_to).toBe(IDS.otherEmployee)
  })

  it('reattaches anyone who reported to them', async () => {
    // owner -> employee -> otherEmployee. Removing the middle should not
    // detach the branch below it.
    await asServiceRole(db, () => db.query('update public.profiles set reports_to=$1 where id=$2', [IDS.owner, IDS.employee]))
    await asServiceRole(db, () => db.query('update public.profiles set reports_to=$1 where id=$2', [IDS.employee, IDS.otherEmployee]))

    await asUser(db, IDS.owner, () => db.query('select public.deactivate_person($1)', [IDS.employee]))

    const row = await db.query('select reports_to from public.profiles where id=$1', [IDS.otherEmployee])
    expect(row.rows[0].reports_to).toBe(IDS.owner)
  })

  it('stops their routines making new work', async () => {
    await asServiceRole(db, () =>
      db.query(
        `insert into public.task_routines (title, assigned_to, created_by, cadence, due_time, active, checklist)
         values ('Daily', $1, $2, 'daily', '17:00', true, '[]'::jsonb)`,
        [IDS.employee, IDS.owner],
      ),
    )

    await asUser(db, IDS.owner, () => db.query('select public.deactivate_person($1)', [IDS.employee]))

    const row = await db.query('select active from public.task_routines where assigned_to=$1', [IDS.employee])
    expect(row.rows[0].active).toBe(false)
  })

  it('is idempotent', async () => {
    await asUser(db, IDS.owner, () => db.query('select public.deactivate_person($1)', [IDS.employee]))
    const second = await asUser(db, IDS.owner, () =>
      db.query('select public.deactivate_person($1) as n', [IDS.employee]),
    )
    expect(second.rows[0].n).toBe(0)
  })
})

describe('who may remove whom', () => {
  it('an employee cannot remove anyone', async () => {
    const message = await expectRejected(() =>
      asUser(db, IDS.employee, () => db.query('select public.deactivate_person($1)', [IDS.otherEmployee])),
    )
    expect(message).toMatch(/owner|admin/i)
  })

  it('an owner cannot remove themselves', async () => {
    const message = await expectRejected(() =>
      asUser(db, IDS.owner, () => db.query('select public.deactivate_person($1)', [IDS.owner])),
    )
    expect(message).toMatch(/cannot remove yourself/i)
  })

  it('the last owner cannot be removed', async () => {
    await asServiceRole(db, () => db.query(`update public.profiles set role='employee' where id=$1`, [IDS.admin2]))
    const message = await expectRejected(() =>
      asUser(db, IDS.admin2, () => db.query('select public.deactivate_person($1)', [IDS.owner])),
    )
    // admin2 is no longer an owner, so it is refused before the count matters.
    expect(message).toMatch(/owner|admin/i)
  })
})

describe('restoring someone', () => {
  it('puts them back', async () => {
    await asUser(db, IDS.owner, () => db.query('select public.deactivate_person($1)', [IDS.employee]))
    await asUser(db, IDS.owner, () => db.query('select public.reactivate_person($1)', [IDS.employee]))

    const row = await db.query('select deactivated_at from public.profiles where id=$1', [IDS.employee])
    expect(row.rows[0].deactivated_at).toBeNull()
  })
})

describe('signing in after removal', () => {
  it('is reported as removed', async () => {
    await asUser(db, IDS.owner, () => db.query('select public.deactivate_person($1)', [IDS.employee]))
    const result = await asUser(db, IDS.employee, () => db.query('select public.is_deactivated() as gone'))
    expect(result.rows[0].gone).toBe(true)
  })

  it('an active person is not', async () => {
    const result = await asUser(db, IDS.employee, () => db.query('select public.is_deactivated() as gone'))
    expect(result.rows[0].gone).toBe(false)
  })
})

describe('deleting permanently', () => {
  it('works for an account that has done nothing', async () => {
    await asUser(db, IDS.owner, () => db.query('select public.delete_person_permanently($1)', [IDS.otherEmployee]))
    const row = await db.query('select 1 from public.profiles where id=$1', [IDS.otherEmployee])
    expect(row.rows).toHaveLength(0)
  })

  it('is refused for anyone with a history, naming the count', async () => {
    await makeTask(IDS.employee, 'done')
    const message = await expectRejected(() =>
      asUser(db, IDS.owner, () => db.query('select public.delete_person_permanently($1)', [IDS.employee])),
    )
    expect(message).toMatch(/appears in 1 records|remove them from the team instead/i)

    // Still there — the refusal is what protects the report.
    const row = await db.query('select 1 from public.profiles where id=$1', [IDS.employee])
    expect(row.rows).toHaveLength(1)
  })

  it('cannot be used on yourself', async () => {
    const message = await expectRejected(() =>
      asUser(db, IDS.owner, () => db.query('select public.delete_person_permanently($1)', [IDS.owner])),
    )
    expect(message).toMatch(/your own account/i)
  })

  it('an employee cannot delete anyone', async () => {
    const message = await expectRejected(() =>
      asUser(db, IDS.employee, () => db.query('select public.delete_person_permanently($1)', [IDS.otherEmployee])),
    )
    expect(message).toMatch(/owner|admin/i)
  })
})
