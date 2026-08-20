'use client'

import { useMemo, useState } from 'react'
import { WorkCalendar } from '@/components/calendar/work-calendar'
import { PageHeader } from '@/components/shared/page-header'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentUser, useVisibleTasks } from '@/hooks/use-flowline'
import { useProfiles } from '@/lib/data/queries'

const EVERYONE = '__all__'

export default function CalendarPage() {
  const { profile, isAdmin, isLoading: userLoading } = useCurrentUser()
  const { tasks, isLoading } = useVisibleTasks()
  const { data: profiles } = useProfiles()

  // Admins default to their own calendar but can look at anyone's.
  const [who, setWho] = useState<string>('me')

  const target = who === 'me' ? (profile?.id ?? null) : who === EVERYONE ? null : who

  const shown = useMemo(() => {
    if (!isAdmin) return tasks
    if (who === EVERYONE) return tasks
    return tasks.filter((t) => t.assigned_to === target)
  }, [tasks, isAdmin, who, target])

  const targetProfile = useMemo(
    () => (target ? ((profiles ?? []).find((p) => p.id === target) ?? null) : null),
    [profiles, target],
  )

  const caption = !isAdmin
    ? 'Your meetings, deadlines and trips'
    : who === EVERYONE
      ? 'Everyone in the company'
      : `${targetProfile?.full_name ?? 'You'} — meetings, deadlines and trips`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description={
          isAdmin
            ? 'Your month at a glance, and anyone else’s. Tap a day to see what is scheduled.'
            : 'Your month at a glance — meetings, deadlines and trips. Tap a day to see what is on.'
        }
        action={
          isAdmin ? (
            <div className="w-full space-y-1.5 sm:w-64">
              <Label htmlFor="calendar-person" className="sr-only">
                Whose calendar
              </Label>
              <Select value={who} onValueChange={setWho}>
                <SelectTrigger id="calendar-person">
                  <SelectValue placeholder="Choose a calendar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">My calendar</SelectItem>
                  <SelectItem value={EVERYONE}>Everyone</SelectItem>
                  {(profiles ?? [])
                    .filter((p) => p.id !== profile?.id)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : undefined
        }
      />

      {isAdmin && targetProfile && who !== EVERYONE && (
        <div className="flex items-center gap-2.5">
          <PersonAvatar profile={targetProfile} className="h-8 w-8" ring />
          <div>
            <p className="text-[13.5px] font-medium text-zinc-900">{targetProfile.full_name}</p>
            <p className="text-[11.5px] text-zinc-500">{targetProfile.job_title ?? 'Team member'}</p>
          </div>
        </div>
      )}

      <WorkCalendar tasks={shown} isLoading={isLoading || userLoading} caption={caption} />
    </div>
  )
}
