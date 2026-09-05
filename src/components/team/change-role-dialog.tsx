'use client'

import { Loader2, ShieldCheck, UserRound } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCurrentUser } from '@/hooks/use-flowline'
import { useActiveProfiles, useSetPersonRole } from '@/lib/data/queries'
import type { Profile } from '@/lib/types'

/**
 * Making someone an owner, or putting an owner back to being an employee.
 *
 * This exists because of a gap rather than a wish: an owner cannot be removed
 * while they are the only one, and there was no way inside the app to make a
 * second. Handing the company over — or letting one of two owners step down —
 * was impossible without going to the database directly.
 *
 * Promotion is a big grant and the wording says so plainly. An owner sees
 * every person, every job and the whole evening report, and can add and
 * remove people including the person who promoted them.
 */
export function ChangeRoleDialog({
  person,
  open,
  onOpenChange,
}: {
  person: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { profile: me } = useCurrentUser()
  const { data: profiles } = useActiveProfiles()
  const setRole = useSetPersonRole()

  if (!person) return null

  const promoting = person.role !== 'admin'
  const owners = (profiles ?? []).filter((p) => p.role === 'admin')
  const isSelf = me?.id === person.id
  const isLastOwner = !promoting && owners.length <= 1

  const blocked = isSelf
    ? 'You cannot change your own access. Ask another owner to do it.'
    : isLastOwner
      ? 'This is the only owner. Make someone else an owner first, or nobody could run the company.'
      : null

  const firstName = person.full_name.split(' ')[0]

  function onConfirm() {
    if (!person || blocked) return
    setRole.mutate(
      { userId: person.id, role: promoting ? 'admin' : 'employee' },
      {
        onSuccess: () => {
          toast.success(
            promoting
              ? `${person.full_name} is now an owner.`
              : `${person.full_name} is now an employee.`,
            {
              description: promoting
                ? 'They can see the whole company and manage people.'
                : 'They can only see their own work again.',
            },
          )
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {promoting ? <ShieldCheck className="h-4 w-4 text-primary" /> : <UserRound className="h-4 w-4 text-primary" />}
            {promoting ? 'Make an owner' : 'Make an employee'}
          </DialogTitle>
          <DialogDescription>
            {promoting
              ? 'Owners see every person and every job, read the evening report, and can add or remove people — including you.'
              : 'They will only see their own work, and lose the ability to assign work or manage people.'}
          </DialogDescription>
        </DialogHeader>

        <div className="surface flex items-center gap-3 rounded-2xl p-3">
          <PersonAvatar profile={person} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-ink">{person.full_name}</p>
            <p className="truncate text-[12.5px] text-ink-muted">
              {person.job_title ?? 'No job title'} · currently {person.role === 'admin' ? 'an owner' : 'an employee'}
            </p>
          </div>
        </div>

        {blocked && (
          <p role="alert" className="surface rounded-2xl p-3 text-[12.5px] leading-relaxed text-ink">
            {blocked}
          </p>
        )}

        {promoting && !blocked && (
          <p className="text-[11.5px] leading-relaxed text-ink-faint">
            You can change this back at any time, as long as one owner is left.
          </p>
        )}

        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={Boolean(blocked) || setRole.isPending} className="gap-2">
            {setRole.isPending ? <Loader2 className="animate-spin" /> : promoting ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
            {promoting ? `Make ${firstName} an owner` : `Make ${firstName} an employee`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
