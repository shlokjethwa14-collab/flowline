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
    recurrence: z.enum(['once', 'daily']),
    checklist: z.array(checklistItemSchema).max(12, 'Twelve steps is plenty for one task.'),
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
  email: z.string().trim().min(1, 'Enter their work email so they can sign in.').email('That email does not look right.'),
  reports_to: z.string().nullable(),
  role: z.enum(ROLE_VALUES),
})

export type AddEmployeeValues = z.infer<typeof addEmployeeSchema>

export const signInSchema = z.object({
  email: z.string().trim().min(1, 'Enter your work email.').email('That email does not look right.'),
})

export type SignInValues = z.infer<typeof signInSchema>
