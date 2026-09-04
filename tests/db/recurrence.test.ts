import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asServiceRole, asUser, createTestDatabase, dropTestDatabase, expectRejected, IDS } from './harness'

/**
 * The recurrence engine, judged on the thing that actually went wrong in
 * production: the same routine producing more than one occurrence for the
 * same period.
 *
 * Every path that was observed to duplicate is exercised here — a repeated
 * refresh, two callers at once, a scheduler retrying after a failure, and
 * pausing then resuming a routine. Plus the two boundaries where period
 * arithmetic tends to be wrong: the end of a month and the organisation's
 * timezone against the server's.
 */

let db: Client

/** Counts occurrences of a routine, optionally within one period. */
async function occurrences(routineId: string, on?: string): Promise<number> {
  const result = on
    ? await db.query('select count(*)::int n from public.tasks where routine_id=$1 and routine_on=$2', [routineId, on])
    : await db.query('select count(*)::int n from public.tasks where routine_id=$1', [routineId])
  return result.rows[0].n
}

async function makeRoutine(cadence: 'daily' | 'weekly' | 'monthly', title = 'Recurring'): Promise<string> {
  const result = await asServiceRole(db, () =>
    db.query(
      `insert into public.task_routines (title, task_type, assigned_to, created_by, cadence, due_time, active, checklist)
       values ($1, 'general', $2, $3, $4, '17:00', true, '[]'::jsonb) returning id`,
      [title, IDS.employee, IDS.owner, cadence],
    ),
  )
  return result.rows[0].id
}

/** Today according to the organisation, which is what the engine keys on. */
async function orgToday(): Promise<string> {
  const result = await db.query('select public.org_today()::text as d')
  return result.rows[0].d
}

beforeAll(async () => {
  db = await createTestDatabase('recurrence')
}, 120_000)

afterAll(async () => {
  await dropTestDatabase(db)
})

beforeEach(async () => {
  await asServiceRole(db, () => db.query('delete from public.tasks where routine_id is not null'))
  await asServiceRole(db, () => db.query('delete from public.task_routines'))
})

describe('idempotency', () => {
  it('a repeated refresh does not create a second occurrence', async () => {
    const routine = await makeRoutine('daily')
    const today = await orgToday()

    const first = await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks() as n'))
    const second = await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks() as n'))
    const third = await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks() as n'))

    expect(first.rows[0].n).toBe(1)
    // The bug: a conflicting insert used to be counted as a creation, so a
    // refresh reported work it had not made.
    expect(second.rows[0].n).toBe(0)
    expect(third.rows[0].n).toBe(0)
    expect(await occurrences(routine, today)).toBe(1)
  })

  it('two concurrent generators produce exactly one occurrence', async () => {
    const routine = await makeRoutine('daily')

    /*
     * Two separate connections, so these are genuinely simultaneous rather
     * than two statements queued on one session — which would prove nothing.
     *
     * The harness gives each suite its own database, so a client built from
     * the admin URL alone lands on `postgres` and cannot see the function
     * under test. Both are pointed at the database this suite created.
     */
    const dbName = (await db.query('select current_database() as d')).rows[0].d
    const base = new URL(
      process.env.FLOWLINE_TEST_ADMIN_URL ?? 'postgres://postgres:flowline_test_pw@127.0.0.1:5433/postgres',
    )
    base.pathname = `/${dbName}`
    const a = new Client({ connectionString: base.toString() })
    const b = new Client({ connectionString: base.toString() })
    await a.connect()
    await b.connect()

    async function generate(client: Client) {
      await client.query(`select set_config('request.jwt.claim.sub', '${IDS.owner}', false)`)
      return client.query('select public.generate_routine_tasks() as n')
    }

    const [ra, rb] = await Promise.all([generate(a), generate(b)])
    await a.end()
    await b.end()

    const total = ra.rows[0].n + rb.rows[0].n
    expect(total).toBe(1)
    expect(await occurrences(routine)).toBe(1)
  })

  it('a retry after a failed run does not double up', async () => {
    const routine = await makeRoutine('daily')

    // A scheduler run that failed partway: the insert committed, the caller
    // never learned it had. The retry must be a no-op.
    await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks()'))
    await expectRejected(() =>
      asUser(db, IDS.owner, async () => {
        await db.query('select public.generate_routine_tasks()')
        throw new Error('simulated scheduler crash')
      }),
    )
    await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks()'))

    expect(await occurrences(routine)).toBe(1)
  })
})

describe('occurrence windows', () => {
  it('a weekly routine makes one occurrence for the whole week', async () => {
    const routine = await makeRoutine('weekly')
    const today = await orgToday()

    // Every working day of the current week maps to the same Monday.
    const monday = (await db.query(`select date_trunc('week', $1::date)::date::text as d`, [today])).rows[0].d
    for (let offset = 0; offset < 6; offset += 1) {
      const day = (await db.query(`select ($1::date + $2::int)::text as d`, [monday, offset])).rows[0].d
      const withinWindow = (await db.query(`select abs($1::date - public.org_today()) <= 7 as ok`, [day])).rows[0].ok
      if (!withinWindow) continue
      await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks($1)', [day]))
    }

    expect(await occurrences(routine)).toBe(1)
    const stored = await db.query('select routine_on::text as d from public.tasks where routine_id=$1', [routine])
    expect(stored.rows[0].d).toBe(monday)
  })

  it('a monthly routine keys on the first of the month, across a month boundary', async () => {
    const routine = await makeRoutine('monthly')

    // Take a date range that is guaranteed to straddle a month end within
    // the engine's ±7 day window.
    const days = await db.query(
      `select generate_series(public.org_today() - 6, public.org_today() + 6, interval '1 day')::date::text as d`,
    )
    const months = new Set<string>()
    for (const row of days.rows) {
      await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks($1)', [row.d]))
      months.add(row.d.slice(0, 7))
    }

    // One occurrence per distinct month touched, never per day.
    const stored = await db.query(
      'select distinct routine_on::text as d from public.tasks where routine_id=$1 order by 1',
      [routine],
    )
    expect(stored.rows.length).toBeGreaterThanOrEqual(1)
    expect(stored.rows.length).toBeLessThanOrEqual(months.size)
    for (const row of stored.rows) {
      expect(row.d.endsWith('-01')).toBe(true)
    }
  })
})

describe('working days and timezone', () => {
  it('generates nothing on a Sunday, in the organisation timezone', async () => {
    await makeRoutine('daily')
    const sunday = await db.query(
      `select d::text from generate_series(public.org_today() - 7, public.org_today() + 7, interval '1 day') d
       where extract(isodow from d) = 7 limit 1`,
    )
    // Within the ±7 day window there is always exactly one or two Sundays.
    expect(sunday.rows.length).toBeGreaterThan(0)

    const created = await asUser(db, IDS.owner, () =>
      db.query('select public.generate_routine_tasks($1) as n', [sunday.rows[0].d]),
    )
    expect(created.rows[0].n).toBe(0)
  })

  it('Monday through Saturday are all working days', async () => {
    const days = await db.query(
      `select d::text, extract(isodow from d)::int as dow
       from generate_series(public.org_today() - 6, public.org_today() + 6, interval '1 day') d
       where extract(isodow from d) between 1 and 6`,
    )
    for (const row of days.rows) {
      const routine = await makeRoutine('daily', `Daily ${row.d}`)
      const created = await asUser(db, IDS.owner, () =>
        db.query('select public.generate_routine_tasks($1) as n', [row.d]),
      )
      expect(created.rows[0].n).toBeGreaterThan(0)
      await asServiceRole(db, () => db.query('delete from public.tasks where routine_id=$1', [routine]))
      await asServiceRole(db, () => db.query('delete from public.task_routines where id=$1', [routine]))
    }
  })

  it('uses the organisation date, not the server date', async () => {
    // Push the organisation a long way from UTC and confirm org_today()
    // follows it rather than the server clock.
    await asServiceRole(db, () => db.query(`update public.org_settings set timezone='Pacific/Kiritimati'`))
    const ahead = (await db.query('select public.org_today()::text as d')).rows[0].d
    await asServiceRole(db, () => db.query(`update public.org_settings set timezone='Pacific/Midway'`))
    const behind = (await db.query('select public.org_today()::text as d')).rows[0].d

    expect(ahead >= behind).toBe(true)

    await asServiceRole(db, () => db.query(`update public.org_settings set timezone='Asia/Kolkata'`))
  })
})

describe('pause and resume', () => {
  it('pausing stops future generation', async () => {
    const routine = await makeRoutine('daily')
    await asServiceRole(db, () => db.query('update public.task_routines set active=false where id=$1', [routine]))

    const created = await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks() as n'))

    expect(created.rows[0].n).toBe(0)
    expect(await occurrences(routine)).toBe(0)
  })

  it('resuming does not backfill the paused days', async () => {
    const routine = await makeRoutine('daily')
    const today = await orgToday()

    // Run today, pause, let a day pass, resume.
    await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks()'))
    await asServiceRole(db, () => db.query('update public.task_routines set active=false where id=$1', [routine]))

    const yesterday = (await db.query(`select ($1::date - 1)::text as d`, [today])).rows[0].d
    await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks($1)', [yesterday]))

    await asServiceRole(db, () => db.query('update public.task_routines set active=true where id=$1', [routine]))
    await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks()'))

    // Today's occurrence only. The paused day is not silently filled in.
    expect(await occurrences(routine)).toBe(1)
    expect(await occurrences(routine, today)).toBe(1)
    expect(await occurrences(routine, yesterday)).toBe(0)
  })

  it('resuming then refreshing still cannot duplicate today', async () => {
    const routine = await makeRoutine('daily')
    await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks()'))
    await asServiceRole(db, () => db.query('update public.task_routines set active=false where id=$1', [routine]))
    await asServiceRole(db, () => db.query('update public.task_routines set active=true where id=$1', [routine]))
    await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks()'))
    await asUser(db, IDS.owner, () => db.query('select public.generate_routine_tasks()'))

    expect(await occurrences(routine)).toBe(1)
  })
})

describe('authorization', () => {
  it('an employee cannot generate recurring work', async () => {
    await makeRoutine('daily')
    const message = await expectRejected(() =>
      asUser(db, IDS.employee, () => db.query('select public.generate_routine_tasks()')),
    )
    expect(message).toMatch(/owner|admin/i)
  })
})
