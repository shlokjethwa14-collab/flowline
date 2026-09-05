'use client'

import { Loader2, Trash2, UserMinus } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentUser } from '@/hooks/use-flowline'
import { useActiveProfiles, useRemovePerson, useTasks } from '@/lib/data/queries'
import { friendlyError, lastRemovalLostHistory } from '@/lib/data/api'
import type { Profile } from '@/lib/types'

const UNASSIGN = '__unassign__'

/**
 * Taking someone off the team.
 *
 * Two things this screen has to get across, because getting them wrong is
 * expensive and quiet:
 *
 *   * Their history stays. People expect "delete" to erase someone, and here
 *     it deliberately does not — every past report keeps their name on the
 *     work they did. Saying so up front stops an owner going looking for a
 *     harder delete that would corrupt those reports.
 *   * Their unfinished work has to land somewhere. Left attached to a removed
 *     person it vanishes from every screen while still counting as scheduled
 *     and never done. The picker defaults to nobody, which surfaces it as
 *     work needing an owner rather than hiding it.
 */
export function RemovePersonDialog({
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
  const { data: tasks } = useTasks()
  const remove = useRemovePerson()

  /*
   * Keyed on the person rather than reset by an effect. Remounting on a
   * different id gives fresh state for free, and avoids a setState during an
   * effect that would cascade an extra render every time the dialog opens.
   */
  const [reassignTo, setReassignTo] = React.useState<string>(UNASSIGN)

  if (!person) return null

  const openWork = (tasks ?? []).filter((t) => t.assigned_to === person.id && t.status !== 'done')
  const others = (profiles ?? []).filter((p) => p.id !== person.id && !p.deactivated_at)
  const isSelf = me?.id === person.id
  const activeOwners = (profiles ?? []).filter((p) => p.role === 'admin' && !p.deactivated_at)
  const isLastOwner = person.role === 'admin' && activeOwners.length <= 1

  const blocked = isSelf
    ? 'You cannot remove yourself. Ask another owner to do it.'
    : isLastOwner
      ? 'This is the only owner left. Make someone else an owner first.'
      : null

  function onConfirm() {
    if (!person || blocked) return
    remove.mutate(
      { userId: person.id, reassignTo: reassignTo === UNASSIGN ? null : reassignTo },
      {
        onSuccess: (moved) => {
          toast.success(`${person.full_name} was removed from the team.`, {
            description:
              moved > 0
                ? reassignTo === UNASSIGN
                  ? `${moved} unfinished ${moved === 1 ? 'job is' : 'jobs are'} now unassigned.`
                  : `${moved} unfinished ${moved === 1 ? 'job was' : 'jobs were'} handed over.`
                : 'They had no unfinished work.',
          })
          onOpenChange(false)
        },
        onError: (error) => toast.error(friendlyError(error)),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserMinus className="h-4 w-4 text-primary" />
            Remove from the team
          </DialogTitle>
          <DialogDescription>
            They will not be able to sign in, and they disappear from every list. Everything they already did stays on
            the record.
          </DialogDescription>
        </DialogHeader>

        <div className="surface flex items-center gap-3 rounded-2xl p-3">
          <PersonAvatar profile={person} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-ink">{person.full_name}</p>
            <p className="truncate text-[12.5px] text-ink-muted">
              {person.job_title ?? 'No job title'}
              {person.role === 'admin' && ' · Owner'}
            </p>
          </div>
        </div>

        {blocked ? (
          <p role="alert" className="surface rounded-2xl p-3 text-[12.5px] leading-relaxed text-ink">
            {blocked}
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="reassign-to">
              {openWork.length > 0
                ? `Who takes over their ${openWork.length} unfinished ${openWork.length === 1 ? 'job' : 'jobs'}?`
                : 'Who takes over any unfinished work?'}
            </Label>
            <Select value={reassignTo} onValueChange={setReassignTo}>
              <SelectTrigger id="reassign-to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGN}>Nobody — leave it unassigned</SelectItem>
                {others.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                    {p.job_title ? ` · ${p.job_title}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11.5px] leading-relaxed text-ink-faint">
              Unassigned work still shows on All Work so it can be given to someone. Finished work stays with{' '}
              {person.full_name.split(' ')[0]}.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={Boolean(blocked) || remove.isPending} className="gap-2">
            {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Remove {person.full_name.split(' ')[0]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
