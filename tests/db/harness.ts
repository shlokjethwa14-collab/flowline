import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'

const ADMIN_URL =
  process.env.FLOWLINE_TEST_ADMIN_URL ?? 'postgres://postgres:flowline_test_pw@127.0.0.1:5433/postgres'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')
const BOOTSTRAP = join(process.cwd(), 'supabase', 'test', 'bootstrap.sql')

export interface People {
  owner: string
  admin2: string
  employee: string
  otherEmployee: string
}

/** Ids are fixed so failures are readable rather than a wall of UUIDs. */
export const IDS: People = {
  owner: '00000000-0000-0000-0000-0000000000a1',
  admin2: '00000000-0000-0000-0000-0000000000a2',
  employee: '00000000-0000-0000-0000-0000000000e1',
  otherEmployee: '00000000-0000-0000-0000-0000000000e2',
}

function connectionFor(db: string): string {
  const url = new URL(ADMIN_URL)
  url.pathname = `/${db}`
  return url.toString()
}

/**
 * Builds a throwaway database, applies bootstrap + every migration in order,
 * and seeds two admins and two employees.
 *
 * Each suite gets its own database so tests cannot leak state into one
 * another, and so a failing suite leaves an inspectable corpse.
 */
export async function createTestDatabase(name: string): Promise<Client> {
  const dbName = `flowline_test_${name}_${Date.now().toString(36)}`

  const admin = new Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`create database ${dbName}`)
  await admin.end()

  const db = new Client({ connectionString: connectionFor(dbName) })
  await db.connect()

  await db.query(readFileSync(BOOTSTRAP, 'utf8'))

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await db.query(sql)
    } catch (error) {
      throw new Error(`migration ${file} failed: ${(error as Error).message}`)
    }
  }

  await seed(db)
  return db
}

async function seed(db: Client): Promise<void> {
  // Insert auth users first; handle_new_user() creates the profile rows,
  // and the very first one bootstraps as admin by design.
  await db.query(
    `insert into auth.users (id, email) values
       ($1,'owner@test.local'), ($2,'admin2@test.local'),
       ($3,'employee@test.local'), ($4,'other@test.local')`,
    [IDS.owner, IDS.admin2, IDS.employee, IDS.otherEmployee],
  )

  // Force the roles explicitly rather than relying on insert order.
  await db.query(`update public.profiles set role='admin', full_name='Owner' where id=$1`, [IDS.owner])
  await db.query(`update public.profiles set role='admin', full_name='Second Admin' where id=$1`, [IDS.admin2])
  await db.query(`update public.profiles set role='employee', full_name='Employee' where id=$1`, [IDS.employee])
  await db.query(`update public.profiles set role='employee', full_name='Other Employee' where id=$1`, [
    IDS.otherEmployee,
  ])
}

/**
 * Runs a callback inside a transaction as a given signed-in user, judged by
 * RLS exactly as a real Supabase request would be.
 *
 * `set local role authenticated` is the important part: RLS is skipped for
 * the table owner, so a test that stayed as `postgres` would pass no matter
 * how broken the policies were.
 */
export async function asUser<T>(db: Client, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query('begin')
  try {
    if (userId) {
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
      await db.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`)
    }
    await db.query('set local role authenticated')
    const result = await fn()
    await db.query('commit')
    return result
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

/** Same, but leaves the connection as the owner (service-role equivalent). */
export async function asServiceRole<T>(db: Client, fn: () => Promise<T>): Promise<T> {
  await db.query('begin')
  try {
    const result = await fn()
    await db.query('commit')
    return result
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

/** Asserts a statement is rejected, returning the message for inspection. */
export async function expectRejected(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected the statement to be rejected, but it succeeded')
}

export async function dropTestDatabase(db: Client): Promise<void> {
  const name = (await db.query('select current_database() as db')).rows[0].db as string
  await db.end()
  const admin = new Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`drop database if exists ${name} with (force)`)
  await admin.end()
}
