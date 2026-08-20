# Flowline

A calm internal task manager for production, sales and daily operations teams.

Flowline is built for people who do not want a project-management tool. There
are no workspaces to set up, no blank canvases, no custom databases and no
nested subtasks. The owner hands out work; everyone else opens **My Day** and
works down the list. At night the owner reads the **Evening Report** and knows
exactly how the day went.

---

## What it does

**For the owner**

| Screen | What it is for |
| --- | --- |
| **Team Flow** | One vertical chart of the whole company. Tap anyone to give them a job, or add someone under a manager. |
| **Assign Work** | A card for every person. Picking the kind of work fills in a sensible checklist automatically. |
| **Evening Report** | Completion for the day, every call and what was discussed, progress per person, and every piece of work that changed hands — with the reason. Downloadable. |
| **All Work** | Every job in the company, as a list or a drag-and-drop Kanban board. |

**For everyone else**

| Screen | What it is for |
| --- | --- |
| **My Day** | Today's work and anything left over, grouped into Calls, Meetings, Growth work and Operations. |
| **All Work** | Everything assigned to them, list or board. |

Employees can move work along, tick off checklist steps, mark themselves
blocked, write progress notes, and pass work to someone else — but only after
writing down why. They never see admin navigation, and they cannot edit task
titles, deadlines or descriptions, or delete anything.

---

## Running it

You need **Node.js 18.17 or newer** (Node 20+ recommended).

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

With no environment variables set, Flowline starts in **demo mode** — a complete
sample garment company with ten people, real tasks, checklists, progress notes,
handoffs and daily routines. Everything is interactive and saved in your
browser. Use the **Owner view / Employee view** switch in the top bar to see
exactly what each role sees, and **Reset demo data** in the account menu to
start over.

---

## Connecting a real database

### 1. Create a Supabase project

<https://supabase.com/dashboard> → **New project**.

### 2. Apply the schema

Either paste `supabase/schema.sql` into the SQL Editor and run it, or apply the
migrations in order:

```bash
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_helpers.sql
psql "$DATABASE_URL" -f supabase/migrations/0003_triggers.sql
psql "$DATABASE_URL" -f supabase/migrations/0004_rpc.sql
psql "$DATABASE_URL" -f supabase/migrations/0005_rls.sql
psql "$DATABASE_URL" -f supabase/migrations/0006_realtime.sql
```

`supabase/schema.sql` is those six files concatenated. Both are safe to re-run.

### 3. Set your keys

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
**Project Settings → API**. Add `SUPABASE_SERVICE_ROLE_KEY` too if you want to
invite teammates from the UI.

### 4. Sign in

Restart the dev server and open `/login`. **The first account to sign in becomes
the owner automatically** — that decision is made inside the database, not by
anything the browser sends. Everyone added after that starts as an employee.

### 5. Optional: load the sample company

```bash
npm run seed
```

This creates the ten sample people and their work in your project. It needs
`SUPABASE_SERVICE_ROLE_KEY`.

---

## How the permissions actually work

The interface hides admin controls from employees, but that is only politeness.
The real boundary is in PostgreSQL:

- **Row Level Security is on for every table.** Employees can only select tasks
  assigned to them or created by them; admins see everything.
- **A trigger enforces protected columns.** Even if a request slips past a
  policy, `protect_task_columns()` refuses any change to a task's title,
  description, deadline or type from a non-admin. Employees can change only
  status, blocked state and checklist progress.
- **Nobody can promote themselves.** `handle_new_user()` decides the role in the
  database and never reads it from client metadata, and
  `protect_profile_columns()` rejects any self-service role change.
- **Reassignment only happens through `handoff_task()`.** Writing `assigned_to`
  directly is blocked by a trigger. The procedure requires a written reason of
  at least ten characters, and a table `CHECK` constraint enforces the same rule
  for any other path.
- **The service-role key never reaches the browser.** It is read only in
  `src/lib/supabase/admin.ts`, which imports `server-only` — importing it from a
  client component is a build error.

Realtime is enabled on all five tables, so every open screen updates the moment
anything changes.

### Daily routines

`generate_routine_tasks()` creates exactly one task per active routine per
working day (Monday to Saturday). It is idempotent — a unique index on
`(routine_id, routine_on)` means calling it repeatedly is harmless. The app
calls it on load; you can also schedule it with `pg_cron`:

```sql
select cron.schedule(
  'flowline-daily-routines',
  '5 3 * * *',
  $$ select public.generate_routine_tasks(); $$
);
```

---

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run build       # production build
```

---

## Deploying

### Vercel

1. Push the repository to GitHub and import it at <https://vercel.com/new>.
2. Add the environment variables from `.env.example`. Mark
   `SUPABASE_SERVICE_ROLE_KEY` as a **server-side** variable (it must not have a
   `NEXT_PUBLIC_` prefix, so this is automatic).
3. In Supabase → **Authentication → URL Configuration**, set the site URL to
   your deployment and add `https://your-app.vercel.app/auth/callback` to the
   redirect allow-list.
4. Deploy.

### Anywhere else

`npm run build && npm run start` behind any Node host. Node 18.17+, port 3000 by
default.

---

## How it is put together

```
src/
  app/
    (app)/                 the signed-in shell
      team-flow/           org chart              admin
      assign/              per-person assignment  admin
      evening-report/      end-of-day summary     admin
      all-work/            list + kanban          everyone
      my-day/              focused day view       everyone
    api/team/invite/       service-role invite route
    auth/callback/         email link lands here
    auth/sign-out/         clears the session
    login/                 passwordless sign-in
  components/
    ui/                    shadcn/ui on Radix, restyled as glass
    shell/                 sidebar, top bar, role guard
    tasks/                 cards, badges, board, details sheet, assign dialog
    team/                  org chart, add-person dialog
    shared/                empty states, stat cards, avatars
  lib/
    supabase/              browser, server, middleware, admin clients
    demo/                  the sample company and its in-memory store
    data/                  one API surface over Supabase *or* the demo store
    report.ts              evening report builder + text export
supabase/
  schema.sql               everything, in one runnable file
  migrations/              the same thing in six ordered steps
scripts/seed.ts            loads the sample company into a real project
```

The important idea is `src/lib/data/`. Every screen calls the same functions;
that layer decides whether the call goes to PostgreSQL or to the demo store. It
is why demo mode is genuinely the whole application rather than a mock-up, and
why there is only one code path to maintain.

**Stack:** Next.js 14 (App Router) · React 18 · TypeScript (strict, no `any`) ·
Tailwind CSS · shadcn/ui on Radix · Supabase (Postgres, Auth, Realtime, RLS) ·
TanStack Query · Zustand · React Hook Form + Zod · @hello-pangea/dnd · Lucide.

---

## Design notes

The interface is a "liquid glass" system: a white base, translucent panels with
backdrop blur and saturation, soft layered shadows, and buttons with real
pressed states. It is built from CSS gradients and transforms only — no WebGL,
no canvas, nothing that costs a frame on a cheap laptop.

Every animation is wrapped by `prefers-reduced-motion`, loading states are
skeletons that occupy the final layout box (so nothing jumps), and every list
has a written empty state rather than a blank area.
