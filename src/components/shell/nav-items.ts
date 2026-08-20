import { CalendarCheck, ClipboardList, LayoutGrid, MoonStar, Network, type LucideIcon } from 'lucide-react'
import type { Role } from '@/lib/types'

export interface NavItem {
  href: string
  label: string
  description: string
  icon: LucideIcon
}

const ADMIN_NAV: NavItem[] = [
  {
    href: '/team-flow',
    label: 'Team Flow',
    description: 'Who reports to whom, and what each person is carrying.',
    icon: Network,
  },
  {
    href: '/assign',
    label: 'Assign Work',
    description: 'Give someone a job in a few taps.',
    icon: ClipboardList,
  },
  {
    href: '/evening-report',
    label: 'Evening Report',
    description: 'How the day actually went.',
    icon: MoonStar,
  },
  {
    href: '/all-work',
    label: 'All Work',
    description: 'Every job in the company.',
    icon: LayoutGrid,
  },
]

const EMPLOYEE_NAV: NavItem[] = [
  {
    href: '/my-day',
    label: 'My Day',
    description: 'Just what you need to finish today.',
    icon: CalendarCheck,
  },
  {
    href: '/all-work',
    label: 'All Work',
    description: 'Everything assigned to you.',
    icon: LayoutGrid,
  },
]

export function navFor(role: Role): NavItem[] {
  return role === 'admin' ? ADMIN_NAV : EMPLOYEE_NAV
}

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  return role === 'admin' ? '/team-flow' : '/my-day'
}
