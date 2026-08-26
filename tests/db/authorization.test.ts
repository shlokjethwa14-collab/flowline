import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asServiceRole, asUser, createTestDatabase, dropTestDatabase, expectRejected, IDS } from './harness'

/**
 * Authorization tests for every privileged database object.
 *
 * These run as `authenticated` with a real JWT subject, so they exercise the
 * same path a direct PostgREST call from the browser would take. Anything
 * that passes here cannot be bypassed by skipping the React UI.
 */
describe('database authorization', () => {
  let db: Client
  let ownerTask: string
  let employeeTask: string

  beforeAll(async () => {
    db = await createTestDatabase('authz')

    await asServiceRole(db, async () => {
      const a = await db.query(
        `insert into public.tasks (title, assigned_to, created_by, due_date, task_type, checklist)
         values ('Owner task', $1, $1, now() - interval '2 days', 'general',
                 '[{"id":"c1","label":"Step one","done":false}]'::jsonb)
         returning id`,
        [IDS.owner],
      )
      ownerTask = a.rows[0].id

      const b = await db.query(
        `insert into public.tasks (title, assigned_to, created_by, due_date, task_type, checklist)
         values ('Employee task', $1, $2, now() - interval '2 days', 'general',
                 '[{"id":"c1","label":"Step one","done":false}]'::jsonb)
         returning id`,
        [IDS.employee, IDS.owner],
      )
      employeeTask = b.rows[0].id
    })
  }, 120_000)

  afterAll(async () => {
    if (db) await dropTestDatabase(db)
  })

  describe('roll_over_unfinished', () => {
    it('cannot be executed by an employee', async () => {
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () => db.query('select public.roll_over_unfinished(current_date)')),
      )
      expect(message).toMatch(/permission denied|not permitted|only an owner/i)
    })

    it('does not move another person’s deadline when an employee tries', async () => {
      const before = await asServiceRole(db, async () =>
        (await db.query('select due_date from public.tasks where id=$1', [ownerTask])).rows[0].due_date,
      )
      await expectRejected(() =>
        asUser(db, IDS.employee, () => db.query('select public.roll_over_unfinished(current_date)')),
      )
      const after = await asServiceRole(db, async () =>
        (await db.query('select due_date from public.tasks where id=$1', [ownerTask])).rows[0].due_date,
      )
      expect(after).toEqual(before)
    })

    it('is allowed for an admin', async () => {
      const rows = await asUser(db, IDS.owner, () => db.query('select public.roll_over_unfinished() as moved'))
      expect(Number(rows.rows[0].moved)).toBeGreaterThanOrEqual(0)
    })
  })

  describe('generate_routine_tasks', () => {
    it('cannot be executed by an employee', async () => {
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () => db.query('select public.generate_routine_tasks(current_date)')),
      )
      expect(message).toMatch(/permission denied|not permitted|only an owner/i)
    })

    it('rejects an arbitrary far-future date even from an admin', async () => {
      const message = await expectRejected(() =>
        asUser(db, IDS.owner, () => db.query(`select public.generate_routine_tasks(current_date + 400)`)),
      )
      expect(message).toMatch(/date|range|out of/i)
    })
  })

  describe('log_call', () => {
    it('refuses to assign follow-up work to another person when the caller is an employee', async () => {
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () =>
          db.query(
            `select public.log_call('Acme','transcript text here','summary',
               '[{"title":"Do a thing","kind":"callback","due_date":"2030-01-02","due_time":"11:00","certainty":"stated","quote":"q"}]'::jsonb,
               '[]'::jsonb, null, null, $1)`,
            [IDS.otherEmployee],
          ),
        ),
      )
      expect(message).toMatch(/assign|yourself|owner/i)
    })

    it('rejects a task id the caller cannot see', async () => {
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () =>
          db.query(
            `select public.log_call('Acme','transcript text here','summary','[]'::jsonb,'[]'::jsonb,$1,null,null)`,
            [ownerTask],
          ),
        ),
      )
      expect(message).toMatch(/task|permission|not found|cannot/i)
    })

    it('rejects an oversized commitment batch', async () => {
      const many = JSON.stringify(
        Array.from({ length: 60 }, (_, i) => ({
          title: `Spam ${i}`,
          kind: 'callback',
          due_date: '2030-01-02',
          due_time: '11:00',
          certainty: 'stated',
          quote: 'q',
        })),
      )
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () =>
          db.query(
            `select public.log_call('Acme','transcript text here','summary',$1::jsonb,'[]'::jsonb,null,null,null)`,
            [many],
          ),
        ),
      )
      expect(message).toMatch(/too many|limit/i)
    })

    it('allows an employee to log their own call with follow-ups assigned to themselves', async () => {
      const result = await asUser(db, IDS.employee, () =>
        db.query(
          `select public.log_call('Acme','a real transcript of the call','summary',
             '[{"title":"Ring back","kind":"callback","due_date":"2030-01-02","due_time":"11:00","certainty":"stated","quote":"q"}]'::jsonb,
             '[]'::jsonb, null, null, null) as call`,
        ),
      )
      expect(result.rows[0].call).toBeTruthy()

      const owned = await asServiceRole(db, async () =>
        (
          await db.query(
            `select assigned_to from public.tasks where title='Ring back'`,
          )
        ).rows,
      )
      expect(owned).toHaveLength(1)
      expect(owned[0].assigned_to).toBe(IDS.employee)
    })

    it('blocks a direct insert into call_logs that bypasses the RPC', async () => {
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () =>
          db.query(
            `insert into public.call_logs (counterparty, recorded_by, transcript, summary)
             values ('Bypass', $1, 'x', 'y')`,
            [IDS.employee],
          ),
        ),
      )
      expect(message).toMatch(/permission denied|row-level security|use the/i)
    })
  })

  describe('employee task field tampering', () => {
    it('cannot change the title', async () => {
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () =>
          db.query(`update public.tasks set title='Hijacked' where id=$1`, [employeeTask]),
        ),
      )
      expect(message).toMatch(/only an owner/i)
    })

    it('cannot move its own deadline', async () => {
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () =>
          db.query(`update public.tasks set due_date = now() + interval '30 days' where id=$1`, [employeeTask]),
        ),
      )
      expect(message).toMatch(/deadline|only an owner/i)
    })

    it('cannot rewrite checklist labels or add steps', async () => {
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () =>
          db.query(
            `update public.tasks
                set checklist='[{"id":"c1","label":"Renamed","done":true},{"id":"c2","label":"Added","done":true}]'::jsonb
              where id=$1`,
            [employeeTask],
          ),
        ),
      )
      expect(message).toMatch(/checklist/i)
    })

    it('cannot forge audit timestamps', async () => {
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () =>
          db.query(`update public.tasks set completed_at = now() - interval '5 days' where id=$1`, [employeeTask]),
        ),
      )
      expect(message).toMatch(/only an owner|audit|cannot/i)
    })

    it('cannot reassign the task to someone else', async () => {
      const message = await expectRejected(() =>
        asUser(db, IDS.employee, () =>
          db.query(`update public.tasks set assigned_to=$1 where id=$2`, [IDS.otherEmployee, employeeTask]),
        ),
      )
      expect(message).toMatch(/handoff/i)
    })

    it('cannot touch a task that is not theirs', async () => {
      const result = await asUser(db, IDS.employee, () =>
        db.query(`update public.tasks set is_blocked=true where id=$1`, [ownerTask]),
      )
      // RLS filters the row out rather than raising: zero rows affected.
      expect(result.rowCount).toBe(0)
    })

    it('CAN tick a checklist box on its own task', async () => {
      const result = await asUser(db, IDS.employee, () =>
        db.query(
          `select public.set_checklist_item($1, 'c1', true) as ok`,
          [employeeTask],
        ),
      )
      expect(result.rows[0].ok).toBeTruthy()
    })
  })
})
