import {
  Boxes,
  ClipboardList,
  Hourglass,
  Phone,
  ShoppingCart,
  Sprout,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ChecklistItem, TaskStatus, TaskType } from './types'
import { uid } from './utils'

export interface TaskTypeMeta {
  value: TaskType
  label: string
  /** Plain-language hint shown under the picker. */
  hint: string
  icon: LucideIcon
  /** Tailwind classes for the tinted chip. */
  chip: string
  dot: string
  /** Checklist prefilled when this type is picked. */
  template: string[]
}

export const TASK_TYPES: TaskTypeMeta[] = [
  {
    value: 'call',
    label: 'Call someone',
    hint: 'Phone a customer, supplier or retailer.',
    icon: Phone,
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
    dot: 'bg-emerald-500',
    template: ['Make the call', 'Record what was discussed', 'Add any follow-up date'],
  },
  {
    value: 'order',
    label: 'Order something',
    hint: 'Place an order with a supplier or unit.',
    icon: ShoppingCart,
    chip: 'bg-amber-50 text-amber-700 ring-amber-200/70',
    dot: 'bg-amber-500',
    template: ['Confirm item and quantity', 'Place the order', 'Record expected delivery'],
  },
  {
    value: 'entry',
    label: 'Data entry',
    hint: 'Enter numbers into the register or sheet.',
    icon: ClipboardList,
    chip: 'bg-sky-50 text-sky-700 ring-sky-200/70',
    dot: 'bg-sky-500',
    template: ['Collect the day’s figures', 'Enter them into the sheet', 'Check the totals match'],
  },
  {
    value: 'long',
    label: 'Long work',
    hint: 'Work that runs over several hours or days.',
    icon: Hourglass,
    chip: 'bg-violet-50 text-violet-700 ring-violet-200/70',
    dot: 'bg-violet-500',
    template: ['Plan the steps', 'Do the work', 'Note where it stands at day end'],
  },
  {
    value: 'meeting',
    label: 'Meeting',
    hint: 'Sit down with the team or a visitor.',
    icon: Users,
    chip: 'bg-rose-50 text-rose-700 ring-rose-200/70',
    dot: 'bg-rose-500',
    template: ['Prepare agenda', 'Attend meeting', 'Record decisions and owners'],
  },
  {
    value: 'growth',
    label: 'Growth task',
    hint: 'New customers, new lines, new markets.',
    icon: Sprout,
    chip: 'bg-teal-50 text-teal-700 ring-teal-200/70',
    dot: 'bg-teal-500',
    template: ['Decide who to approach', 'Reach out', 'Write down the response'],
  },
  {
    value: 'general',
    label: 'General work',
    hint: 'Anything that does not fit the others.',
    icon: Boxes,
    chip: 'bg-zinc-100 text-zinc-700 ring-zinc-200/70',
    dot: 'bg-zinc-500',
    template: ['Start the work', 'Finish the work', 'Note the outcome'],
  },
]

const TYPE_BY_VALUE = new Map<TaskType, TaskTypeMeta>(TASK_TYPES.map((t) => [t.value, t]))

export function taskTypeMeta(type: TaskType): TaskTypeMeta {
  return TYPE_BY_VALUE.get(type) ?? TASK_TYPES[TASK_TYPES.length - 1]
}

/** Fresh checklist rows (with new ids) for a task type. */
export function checklistTemplate(type: TaskType): ChecklistItem[] {
  return taskTypeMeta(type).template.map((label) => ({ id: uid(), label, done: false }))
}

export interface StatusMeta {
  value: TaskStatus
  label: string
  chip: string
  dot: string
  /** Column tint on the Kanban board. */
  column: string
}

export const TASK_STATUSES: StatusMeta[] = [
  {
    value: 'todo',
    label: 'To Do',
    chip: 'bg-zinc-100 text-zinc-700 ring-zinc-200/70',
    dot: 'bg-zinc-400',
    column: 'from-zinc-100/70',
  },
  {
    value: 'in_progress',
    label: 'In Progress',
    chip: 'bg-blue-50 text-blue-700 ring-blue-200/70',
    dot: 'bg-blue-500',
    column: 'from-blue-100/60',
  },
  {
    value: 'review',
    label: 'Review',
    chip: 'bg-violet-50 text-violet-700 ring-violet-200/70',
    dot: 'bg-violet-500',
    column: 'from-violet-100/60',
  },
  {
    value: 'done',
    label: 'Done',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
    dot: 'bg-emerald-500',
    column: 'from-emerald-100/60',
  },
]

const STATUS_BY_VALUE = new Map<TaskStatus, StatusMeta>(TASK_STATUSES.map((s) => [s.value, s]))

export function statusMeta(status: TaskStatus): StatusMeta {
  return STATUS_BY_VALUE.get(status) ?? TASK_STATUSES[0]
}

/** The four groups on My Day. Order matters — it is the order shown. */
export const MY_DAY_GROUPS = [
  { key: 'calls', label: 'Calls', types: ['call'] as TaskType[], icon: Phone },
  { key: 'meetings', label: 'Meetings', types: ['meeting'] as TaskType[], icon: Users },
  { key: 'growth', label: 'Growth work', types: ['growth'] as TaskType[], icon: Sprout },
  {
    key: 'operations',
    label: 'Operations',
    types: ['order', 'entry', 'long', 'general'] as TaskType[],
    icon: Boxes,
  },
] as const

export type MyDayGroupKey = (typeof MY_DAY_GROUPS)[number]['key']
