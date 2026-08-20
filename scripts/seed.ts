/**
 * Seeds a real Supabase project with the same sample company that demo mode
 * shows. Run it once against a fresh database, after applying the schema:
 *
 *   npm run seed
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service
 * role key stays on your machine — it is never bundled into the app.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildDemoDataset } from '../src/lib/demo/dataset'
import type { Database } from '../src/lib/supabase/database.types'

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

function loadEnvFile(file: string): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), file), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = value
    }
  } catch {
    // No env file is fine when the variables are already exported.
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const EMAIL_DOMAIN = (process.env.SEED_EMAIL_DOMAIN ?? 'flowline.test').trim()

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '\nMissing configuration.\n\n' +
      'Set these in .env.local before seeding:\n' +
      '  NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co\n' +
      '  SUPABASE_SERVICE_ROLE_KEY=<service role key>\n',
  )
  process.exit(1)
}

const db = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function emailFor(fullName: string): string {
  const handle = fullName
    .toLowerCase()
    .normalize('NFD')
    // Strip combining accent marks, then slug whatever is left.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '')
  return `${handle}@${EMAIL_DOMAIN}`
}

function step(message: string): void {
  console.warn(`  ${message}`)
}

/** Creates the auth user, or finds them if the email is already registered. */
async function ensureUser(fullName: string, jobTitle: string | null): Promise<string> {
  const email = emailFor(fullName)

  const { data, error } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName, job_title: jobTitle },
  })

  if (!error && data.user) return data.user.id

  const alreadyExists = error && /already been registered|already exists|email_exists/i.test(error.message)
  if (!alreadyExists) {
    throw new Error(`Could not create ${email}: ${error?.message ?? 'unknown error'}`)
  }

  const { data: list, error: listError } = await db.auth.admin.listUsers({ page: 1, perPage: 500 })
  if (listError) throw new Error(listError.message)
  const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!found) throw new Error(`${email} is registered but could not be found.`)
  return found.id
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.warn('\nSeeding Flowline…\n')
  const dataset = buildDemoDataset()

  // 1. People -----------------------------------------------------------
  step('Creating accounts and profiles…')
  const idFor = new Map<string, string>()

  for (const profile of dataset.profiles) {
    const realId = await ensureUser(profile.full_name, profile.job_title)
    idFor.set(profile.id, realId)
  }

  // Two passes: everyone must exist before reports_to can be wired up.
  for (const profile of dataset.profiles) {
    const realId = idFor.get(profile.id)
    if (!realId) continue
    const managerId = profile.reports_to ? (idFor.get(profile.reports_to) ?? null) : null

    const { error } = await db.from('profiles').upsert(
      {
        id: realId,
        role: profile.role,
        full_name: profile.full_name,
        job_title: profile.job_title,
        reports_to: managerId,
      },
      { onConflict: 'id' },
    )
    if (error) throw new Error(`profiles: ${error.message}`)
  }
  step(`  ${dataset.profiles.length} people ready.`)

  // 2. Routines ---------------------------------------------------------
  step('Adding daily routines…')
  const routineIdFor = new Map<string, string>()

  for (const routine of dataset.routines) {
    const { data, error } = await db
      .from('task_routines')
      .insert({
        title: routine.title,
        task_type: routine.task_type,
        assigned_to: routine.assigned_to ? (idFor.get(routine.assigned_to) ?? null) : null,
        created_by: routine.created_by ? (idFor.get(routine.created_by) ?? null) : null,
        due_time: routine.due_time,
        checklist: routine.checklist,
        active: routine.active,
        last_generated_on: routine.last_generated_on,
      })
      .select('id')
      .single()
    if (error) throw new Error(`task_routines: ${error.message}`)
    if (data) routineIdFor.set(routine.id, data.id)
  }
  step(`  ${dataset.routines.length} routines added.`)

  // 3. Tasks ------------------------------------------------------------
  step('Adding tasks…')
  const taskIdFor = new Map<string, string>()

  for (const task of dataset.tasks) {
    const { data, error } = await db
      .from('tasks')
      .insert({
        title: task.title,
        description: task.description,
        status: task.status,
        assigned_to: task.assigned_to ? (idFor.get(task.assigned_to) ?? null) : null,
        created_by: task.created_by ? (idFor.get(task.created_by) ?? null) : null,
        due_date: task.due_date,
        is_blocked: task.is_blocked,
        completed_at: task.completed_at,
        task_type: task.task_type,
        checklist: task.checklist,
        routine_id: task.routine_id ? (routineIdFor.get(task.routine_id) ?? null) : null,
        routine_on: task.routine_on,
        created_at: task.created_at,
      })
      .select('id')
      .single()
    if (error) throw new Error(`tasks: ${error.message}`)
    if (data) taskIdFor.set(task.id, data.id)
  }
  step(`  ${dataset.tasks.length} tasks added.`)

  // 4. Activity ---------------------------------------------------------
  step('Adding progress notes…')
  for (const entry of dataset.activity) {
    const taskId = taskIdFor.get(entry.task_id)
    if (!taskId) continue
    const { error } = await db.from('activity_logs').insert({
      task_id: taskId,
      user_id: entry.user_id ? (idFor.get(entry.user_id) ?? null) : null,
      content: entry.content,
      created_at: entry.created_at,
    })
    if (error) throw new Error(`activity_logs: ${error.message}`)
  }
  step(`  ${dataset.activity.length} notes added.`)

  // 5. Handoffs ---------------------------------------------------------
  step('Adding handoff history…')
  for (const handoff of dataset.handoffs) {
    const taskId = taskIdFor.get(handoff.task_id)
    if (!taskId) continue
    const { error } = await db.from('task_handoffs').insert({
      task_id: taskId,
      from_user_id: handoff.from_user_id ? (idFor.get(handoff.from_user_id) ?? null) : null,
      to_user_id: handoff.to_user_id ? (idFor.get(handoff.to_user_id) ?? null) : null,
      note: handoff.note,
      created_at: handoff.created_at,
    })
    if (error) throw new Error(`task_handoffs: ${error.message}`)
  }
  step(`  ${dataset.handoffs.length} handoffs added.`)

  const ownerEmail = emailFor(dataset.profiles[0].full_name)
  console.warn(
    `\nDone.\n\n` +
      `The owner account is ${ownerEmail}.\n` +
      `Everyone was created with a confirmed email and no password — sign in from /login\n` +
      `using the emailed link, or set passwords from the Supabase dashboard.\n`,
  )
}

main().catch((error: unknown) => {
  console.error('\nSeeding failed:', error instanceof Error ? error.message : error, '\n')
  process.exit(1)
})
