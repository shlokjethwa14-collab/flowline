import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Concatenates the ordered migrations into the consolidated schema.
 *
 * Keeping this generated rather than hand-maintained is what stops the two
 * drifting: a migration that is not in the schema is a migration a fresh
 * environment silently misses.
 */
const dir = join(process.cwd(), 'supabase', 'migrations')
const out = join(process.cwd(), 'supabase', 'schema.sql')

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

const header = `-- =====================================================================
-- Flowline - consolidated schema
-- =====================================================================
-- Generated from supabase/migrations/*.sql in order. Applying this file to
-- a fresh database is equivalent to applying every migration.
--
-- Do not hand-edit: add a new numbered migration and regenerate with
--   npm run schema:build
-- =====================================================================
`

const body = files
  .map(
    (f) =>
      `\n-- =====================================================================\n-- ${f}\n-- =====================================================================\n` +
      readFileSync(join(dir, f), 'utf8'),
  )
  .join('\n')

writeFileSync(out, `${header}${body}`, 'utf8')
console.warn(`schema.sql rebuilt from ${files.length} migrations`)
