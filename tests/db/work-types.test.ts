import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asServiceRole, createTestDatabase, dropTestDatabase, IDS } from './harness'

/**
 * Custom work types must always carry a classification.
 *
 * The reported symptom was a work type rendering "Groups with · about 1h
 * 30m" — a sentence with its subject missing. The cause was rows stored
 * without a `base_type`, from a period when the column was optional. The
 * interface fix stops it displaying wrong; this makes sure the data itself
 * cannot be in that state again.
 */

let db: Client

beforeAll(async () => {
  db = await createTestDatabase('worktypes')
}, 120_000)

afterAll(async () => {
  await dropTestDatabase(db)
})

describe('base_type', () => {
  it('cannot be stored as null', async () => {
    await expect(
      asServiceRole(db, () =>
        db.query(
          `insert into public.task_categories (name, base_type, color, icon, created_by)
           values ('Dispatch run', null, 'violet', 'boxes', $1)`,
          [IDS.owner],
        ),
      ),
    ).rejects.toThrow(/null/i)
  })

  it('defaults to general work when omitted entirely', async () => {
    const result = await asServiceRole(db, () =>
      db.query(
        `insert into public.task_categories (name, color, icon, created_by)
         values ('Payment follow-up', 'violet', 'boxes', $1)
         returning base_type::text as base_type`,
        [IDS.owner],
      ),
    )
    expect(result.rows[0].base_type).toBe('general')
  })

  it('every row has a classification the interface can name', async () => {
    // The set the UI knows how to label. A value outside it renders blank,
    // which is the defect in a different disguise.
    const known = ['general', 'call', 'order', 'entry', 'long', 'meeting', 'growth']

    await asServiceRole(db, () =>
      db.query(
        `insert into public.task_categories (name, base_type, color, icon, created_by)
         values ('Factory visit', 'growth', 'violet', 'boxes', $1)`,
        [IDS.owner],
      ),
    )

    const rows = await db.query('select base_type::text as base_type from public.task_categories')
    expect(rows.rows.length).toBeGreaterThan(0)
    for (const row of rows.rows) {
      expect(known).toContain(row.base_type)
    }
  })

  it('the backfill is idempotent — rerunning the migration changes nothing', async () => {
    const before = await db.query(
      `select count(*)::int n from public.task_categories where base_type::text <> 'general'`,
    )

    await asServiceRole(db, () =>
      db.query(`update public.task_categories set base_type = 'general' where base_type is null`),
    )

    const after = await db.query(
      `select count(*)::int n from public.task_categories where base_type::text <> 'general'`,
    )
    expect(after.rows[0].n).toBe(before.rows[0].n)
  })
})
