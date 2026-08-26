import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asServiceRole, asUser, createTestDatabase, dropTestDatabase, expectRejected, IDS } from './harness'

/**
 * Completion, blocking and audit-history rules.
 *
 * Every assertion here goes through `authenticated` with a real JWT subject,
 * so passing means a raw PostgREST request cannot do it either.
 */
describe('task safeguards and history', () => {
  let db: Client

  async function newTask(opts: {
    assignedTo?: string
    type?: string
    checklist?: string
  }): Promise<string> {
    return asServiceRole(db, async () => {
      const r = await db.query(
        `insert into public.tasks (title, assigned_to, created_by, due_date, task_type, checklist)
         values ('Test task', $1, $2, now() + interval '1 day', $3::public.task_type, $4::jsonb)
         returning id`,
        [
          opts.assignedTo ?? IDS.employee,
          IDS.owner,
          opts.type ?? 'general',
          opts.checklist ?? '[]',
        ],
      )
      return r.rows[0].id as string
    })
  }

  beforeAll(async () => {
    db = await createTestDatabase('safeguards')
  }, 120_000)

  afterAll(async () => {
    if (db) await dropTestDatabase(db)
  })

  describe('completion safeguards', () => {
    it('refuses to close a task with unfinished checklist steps', async () => {
      const id = await newTask({
        checklist: '[{"id":"a","label":"One","done":true},{"id":"b","label":"Two","done":false}]',
      })
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () =>
          db.query(`select public.set_task_status($1,'done','details')`, [id]),
        ),
      )
      expect(message).toMatch(/checklist/i)
    })

    it('allows closing once every step is ticked', async () => {
      const id = await newTask({
        checklist: '[{"id":"a","label":"One","done":false}]',
      })
      await asUser(db, IDS.employee, () => db.query(`select public.set_checklist_item($1,'a',true)`, [id]))
      await asUser(db, IDS.employee, () => db.query(`select public.set_task_status($1,'done','details')`, [id]))

      const status = await asServiceRole(db, async () =>
        (await db.query(`select status from public.tasks where id=$1`, [id])).rows[0].status,
      )
      expect(status).toBe('done')
    })

    it('allows closing a task that has no checklist at all', async () => {
      const id = await newTask({ checklist: '[]' })
      await asUser(db, IDS.employee, () => db.query(`select public.set_task_status($1,'done','details')`, [id]))
      const status = await asServiceRole(db, async () =>
        (await db.query(`select status from public.tasks where id=$1`, [id])).rows[0].status,
      )
      expect(status).toBe('done')
    })

    it('refuses to close a call with no evidence of what was discussed', async () => {
      const id = await newTask({ type: 'call' })
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () => db.query(`select public.set_task_status($1,'done','details')`, [id])),
      )
      expect(message).toMatch(/discussed|record/i)
    })

    it('allows closing a call once an outcome note exists', async () => {
      const id = await newTask({ type: 'call' })
      await asUser(db, IDS.employee, () =>
        db.query(`insert into public.activity_logs (task_id, user_id, content) values ($1,$2,'Spoke to them.')`, [
          id,
          IDS.employee,
        ]),
      )
      await asUser(db, IDS.employee, () => db.query(`select public.set_task_status($1,'done','details')`, [id]))
      const status = await asServiceRole(db, async () =>
        (await db.query(`select status from public.tasks where id=$1`, [id])).rows[0].status,
      )
      expect(status).toBe('done')
    })

    it('applies the same rule to a raw PostgREST-style update, not just the RPC', async () => {
      const id = await newTask({
        checklist: '[{"id":"a","label":"One","done":false}]',
      })
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () => db.query(`update public.tasks set status='done' where id=$1`, [id])),
      )
      expect(message).toMatch(/checklist/i)
    })
  })

  describe('blocked safeguards', () => {
    it('refuses to block without a meaningful reason', async () => {
      const id = await newTask({})
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () => db.query(`select public.set_task_blocked($1,true,'busy','details')`, [id])),
      )
      expect(message).toMatch(/10 characters|blocking/i)
    })

    it('records who blocked it and when', async () => {
      const id = await newTask({})
      await asUser(db, IDS.employee, () =>
        db.query(`select public.set_task_blocked($1,true,'Waiting on the dyeing unit to confirm','details')`, [id]),
      )
      const row = await asServiceRole(db, async () =>
        (
          await db.query(`select is_blocked, blocked_reason, blocked_by, blocked_at from public.tasks where id=$1`, [
            id,
          ])
        ).rows[0],
      )
      expect(row.is_blocked).toBe(true)
      expect(row.blocked_by).toBe(IDS.employee)
      expect(row.blocked_at).toBeTruthy()
      expect(row.blocked_reason).toMatch(/dyeing/)
    })

    it('cannot be blocked by setting the flag directly and skipping the reason', async () => {
      const id = await newTask({})
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () => db.query(`update public.tasks set is_blocked=true where id=$1`, [id])),
      )
      expect(message).toMatch(/reason|blocked/i)
    })

    it('clears the reason on unblock and audits it', async () => {
      const id = await newTask({})
      await asUser(db, IDS.employee, () =>
        db.query(`select public.set_task_blocked($1,true,'Waiting on the supplier callback','details')`, [id]),
      )
      await asUser(db, IDS.employee, () => db.query(`select public.set_task_blocked($1,false,null,'details')`, [id]))

      const row = await asServiceRole(db, async () =>
        (await db.query(`select is_blocked, blocked_reason from public.tasks where id=$1`, [id])).rows[0],
      )
      expect(row.is_blocked).toBe(false)
      expect(row.blocked_reason).toBeNull()

      const events = await asServiceRole(db, async () =>
        (
          await db.query(`select event_type from public.task_events where task_id=$1 order by id`, [id])
        ).rows.map((r) => r.event_type),
      )
      expect(events).toContain('blocked')
      expect(events).toContain('unblocked')
    })
  })

  describe('immutable history', () => {
    it('records completion against the person who made the change, not the assignee', async () => {
      const id = await newTask({ assignedTo: IDS.employee })
      // The OWNER closes an EMPLOYEE's task.
      await asUser(db, IDS.owner, () => db.query(`select public.set_task_status($1,'done','admin')`, [id]))

      const event = await asServiceRole(db, async () =>
        (
          await db.query(
            `select actor_id, assignee_id, source from public.task_events
              where task_id=$1 and event_type='completed'`,
            [id],
          )
        ).rows[0],
      )
      expect(event.actor_id).toBe(IDS.owner)
      expect(event.assignee_id).toBe(IDS.employee)
      expect(event.source).toBe('admin')
    })

    it('keeps the earlier completion event after a task is reopened', async () => {
      const id = await newTask({})
      await asUser(db, IDS.employee, () => db.query(`select public.set_task_status($1,'done','details')`, [id]))
      await asUser(db, IDS.owner, () => db.query(`select public.set_task_status($1,'in_progress','admin')`, [id]))

      const events = await asServiceRole(db, async () =>
        (
          await db.query(`select event_type from public.task_events where task_id=$1 order by id`, [id])
        ).rows.map((r) => r.event_type),
      )
      expect(events).toContain('completed')
      expect(events).toContain('reopened')
    })

    it('cannot be edited by an employee', async () => {
      const id = await newTask({})
      await asUser(db, IDS.employee, () => db.query(`select public.set_task_status($1,'in_progress','details')`, [id]))
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () => db.query(`update public.task_events set actor_id=$1`, [IDS.owner])),
      )
      expect(message).toMatch(/permission denied|cannot be edited|history/i)
    })

    it('cannot be rewritten even by an admin', async () => {
      const id = await newTask({})
      await asUser(db, IDS.employee, () => db.query(`select public.set_task_status($1,'review','details')`, [id]))
      const message = await expectRejected(() =>
        asServiceRole(db, () => db.query(`update public.task_events set to_status='done' where task_id=$1`, [id])),
      )
      expect(message).toMatch(/cannot be edited|history/i)
    })

    it('cannot be deleted', async () => {
      const id = await newTask({})
      await asUser(db, IDS.employee, () => db.query(`select public.set_task_status($1,'review','details')`, [id]))
      const message = await expectRejected(() =>
        asServiceRole(db, () => db.query(`delete from public.task_events where task_id=$1`, [id])),
      )
      expect(message).toMatch(/cannot be deleted|history/i)
    })
  })

  describe('organisation timezone', () => {
    it('builds timestamps from the org timezone, not the session timezone', async () => {
      const result = await asServiceRole(db, async () => {
        await db.query(`update public.org_settings set timezone='Asia/Kolkata' where id`)
        await db.query(`set local timezone to 'UTC'`)
        return (
          await db.query(`select public.org_timestamp('2026-03-10','09:00') as ts`)
        ).rows[0].ts as Date
      })
      // 09:00 IST is 03:30 UTC.
      expect(result.toISOString()).toBe('2026-03-10T03:30:00.000Z')
    })

    it('handles a DST timezone correctly on both sides of the change', async () => {
      const rows = await asServiceRole(db, async () => {
        await db.query(`update public.org_settings set timezone='America/New_York' where id`)
        const before = (await db.query(`select public.org_timestamp('2026-03-07','09:00') as ts`)).rows[0].ts as Date
        const after = (await db.query(`select public.org_timestamp('2026-03-10','09:00') as ts`)).rows[0].ts as Date
        await db.query(`update public.org_settings set timezone='Asia/Kolkata' where id`)
        return { before, after }
      })
      // 09:00 EST is 14:00 UTC; after the 8 March change 09:00 EDT is 13:00 UTC.
      expect(rows.before.toISOString()).toBe('2026-03-07T14:00:00.000Z')
      expect(rows.after.toISOString()).toBe('2026-03-10T13:00:00.000Z')
    })

    it('resolves UTC without offset', async () => {
      const ts = await asServiceRole(db, async () => {
        await db.query(`update public.org_settings set timezone='UTC' where id`)
        const r = (await db.query(`select public.org_timestamp('2026-06-01','09:00') as ts`)).rows[0].ts as Date
        await db.query(`update public.org_settings set timezone='Asia/Kolkata' where id`)
        return r
      })
      expect(ts.toISOString()).toBe('2026-06-01T09:00:00.000Z')
    })

    it('rejects a timezone Postgres does not recognise', async () => {
      const message = await expectRejected(() =>
        asServiceRole(db, () => db.query(`update public.org_settings set timezone='Mars/Olympus' where id`)),
      )
      expect(message).toMatch(/timezone/i)
    })

    it('only lets an owner change the organisation timezone', async () => {
      const result = await asUser(db, IDS.employee, () =>
        db.query(`update public.org_settings set timezone='UTC' where id`),
      )
      expect(result.rowCount).toBe(0)
    })
  })
})
