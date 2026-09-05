import { z } from 'zod'

export const TASK_TYPE_VALUES = ['general', 'call', 'order', 'entry', 'long', 'meeting', 'growth'] as const
export const TASK_STATUS_VALUES = ['todo', 'in_progress', 'review', 'done'] as const
export const ROLE_VALUES = ['admin', 'employee'] as const

export const checklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1, 'Write what needs doing.').max(160, 'Keep this under 160 characters.'),
  done: z.boolean(),
})

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

export const createTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Give the work a name of at least 3 characters.')
      .max(140, 'Keep the name under 140 characters.'),
    description: z.string().trim().max(2000, 'Keep notes under 2000 characters.').optional().or(z.literal('')),
    task_type: z.enum(TASK_TYPE_VALUES),
    assigned_to: z.string().min(1, 'Choose who is doing this.'),
    due_date: z.string().min(1, 'Pick a date.'),
    due_time: z.string().regex(timeRegex, 'Use a time like 17:30.'),
    recurrence: z.enum(['once', 'daily', 'weekly', 'monthly']),
    horizon: z.enum(['day', 'week', 'month']).optional(),
    checklist: z.array(checklistItemSchema).max(12, 'Twelve steps is plenty for one task.'),
    sop: z.string().trim().max(4000, 'Keep the procedure under 4000 characters.').optional().or(z.literal('')),
    /** 0 means "not estimated"; the form leaves it blank by default. */
    estimated_minutes: z.coerce
      .number({ invalid_type_error: 'Enter minutes as a number.' })
      .int('Use whole minutes.')
      .min(0)
      .max(1440, 'That is more than a day — split the job up.')
      .optional(),
    category_id: z.string().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.recurrence === 'once') {
      const parsed = new Date(`${value.due_date}T${value.due_time}`)
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['due_date'], message: 'That date does not look right.' })
      }
    }
  })

export type CreateTaskValues = z.infer<typeof createTaskSchema>

export const handoffSchema = z.object({
  to_user_id: z.string().min(1, 'Choose who should take this over.'),
  note: z
    .string()
    .trim()
    .min(10, 'Please write at least 10 characters explaining why you are passing this on.')
    .max(600, 'Keep the reason under 600 characters.'),
})

export type HandoffValues = z.infer<typeof handoffSchema>

export const noteSchema = z.object({
  content: z
    .string()
    .trim()
    .min(2, 'Write a little more than that.')
    .max(1200, 'Keep the note under 1200 characters.'),
})

export type NoteValues = z.infer<typeof noteSchema>

export const addEmployeeSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter the person’s name.').max(80, 'That name is too long.'),
  job_title: z.string().trim().min(2, 'What do they do?').max(80, 'Keep the job title short.'),
  /*
   * A login ID the owner issues, not an email the person has to own. Most of
   * the people using Flowline are on a factory floor and have no work email,
   * so asking for one asked for something that does not exist — and Supabase
   * then tried to post a confirmation to it.
   *
   * The shape is enforced in three places: here, the CHECK constraint in
   * migration 0014, and the edge function. loginIdProblem() in lib/accounts
   * carries the same rules with the wording used on screen.
   */
  login_id: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'A login ID needs at least 3 characters.')
    .max(31, 'A login ID can be at most 31 characters.')
    .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Lowercase letters, numbers, dot, underscore or hyphen only.'),
  password: z.string().min(10, 'A password needs at least 10 characters.'),
  reports_to: z.string().nullable(),
  role: z.enum(ROLE_VALUES),
})

export type AddEmployeeValues = z.infer<typeof addEmployeeSchema>

export const signInSchema = z.object({
  email: z.string().trim().min(1, 'Enter your work email.').email('That email does not look right.'),
})

export type SignInValues = z.infer<typeof signInSchema>

export const CATEGORY_BASE_TYPES = TASK_TYPE_VALUES

export const categorySchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .trim()
    .min(2, 'Give the work type a name.')
    .max(40, 'Keep the name short — it appears on every card.'),
  base_type: z.enum(CATEGORY_BASE_TYPES),
  color: z.string().min(1),
  icon: z.string().min(1),
  checklist: z.array(checklistItemSchema).max(12, 'Twelve steps is plenty.'),
  sop: z.string().trim().max(4000, 'Keep the procedure under 4000 characters.').optional().or(z.literal('')),
  estimated_minutes: z.coerce.number().int().min(0).max(1440).optional(),
})

export type CategoryValues = z.infer<typeof categorySchema>
