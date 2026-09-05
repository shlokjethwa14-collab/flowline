'use client'

import { Loader2, ShieldCheck, UserCog, UserRound } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentUser } from '@/hooks/use-flowline'
import { useActiveProfiles, useSetPersonRole, useUpdatePersonDetails } from '@/lib/data/queries'
import type { Profile } from '@/lib/types'
import { cn } from '@/lib/utils'

const SUGGESTED_TITLES = [
  'Production Manager',
  'Sales Manager',
  'Cutting Master',
  'Stock Coordinator',
  'Sales Executive',
  'Data Entry Operator',
  'Accounts Manager',
  'Dyeing & Research In-charge',
]

/**
 * Editing a person: their name, their designation, and what they can see.
 *
 * Name and designation are ordinary profile columns, so they save together in
 * one write. Role is not — it goes through set_person_role, where the
 * database refuses any change that would leave the company with no owners.
 * Keeping them apart means the rule lives in one place and the refusal can be
 * a sentence rather than a constraint violation.
 *
 * Role also exists here for a specific reason: an owner cannot be removed
 * while they are the only one, so promoting a second is the prerequisite for
 * ever removing the first.
 */
export function EditPersonDialog({
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
  const updateDetails = useUpdatePersonDetails()
  const setRole = useSetPersonRole()

  const [fullName, setFullName] = React.useState(person?.full_name ?? '')
  const [jobTitle, setJobTitle] = React.useState(person?.job_title ?? '')

  if (!person) return null

  const owners = (profiles ?? []).filter((p) => p.role === 'admin')
  const isSelf = me?.id === person.id
  const isLastOwner = person.role === 'admin' && owners.length <= 1

  const nameProblem = fullName.trim().length < 2 ? 'Enter their name.' : null
  const detailsChanged =
    fullName.trim() !== person.full_name || jobTitle.trim() !== (person.job_title ?? '')

  const roleBlocked = isSelf
    ? 'You cannot change your own access.'
    : isLastOwner
      ? 'This is the only owner. Make someone else an owner first.'
      : null

  const firstName = person.full_name.split(' ')[0]
  const saving = updateDetails.isPending || setRole.isPending

  function onSaveDetails() {
    if (!person || nameProblem) return
    updateDetails.mutate(
      { userId: person.id, full_name: fullName, job_title: jobTitle },
      {
        onSuccess: (updated) => {
          toast.success('Saved.', { description: `${updated.full_name} — ${updated.job_title ?? 'no designation'}` })
          onOpenChange(false)
        },
      },
    )
  }

  function onToggleRole() {
    if (!person || roleBlocked) return
    const promoting = person.role !== 'admin'
    setRole.mutate(
      { userId: person.id, role: promoting ? 'admin' : 'employee' },
      {
        onSuccess: () =>
          toast.success(
            promoting ? `${person.full_name} is now an owner.` : `${person.full_name} is now an employee.`,
            {
              description: promoting
                ? 'They can see the whole company and manage people.'
                : 'They can only see their own work again.',
            },
          ),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-primary" />
            Edit {firstName}
          </DialogTitle>
          <DialogDescription>Change their name, their designation, or what they can see.</DialogDescription>
        </DialogHeader>

        <div className="surface flex items-center gap-3 rounded-2xl p-3">
          <PersonAvatar profile={person} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-ink">{person.full_name}</p>
            <p className="truncate text-[12.5px] text-ink-muted">
              {person.login_id ? `Signs in as ${person.login_id}` : 'No login ID'}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-name">Full name</Label>
          <Input
            id="edit-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-invalid={Boolean(nameProblem)}
            aria-describedby={nameProblem ? 'edit-name-error' : undefined}
          />
          {nameProblem && (
            <p id="edit-name-error" role="alert" className="text-[12px] text-red-500">
              {nameProblem}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-title">Designation</Label>
          <Input
            id="edit-title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            list="edit-title-options"
            placeholder="Stock Coordinator"
          />
          <datalist id="edit-title-options">
            {SUGGESTED_TITLES.map((title) => (
              <option key={title} value={title} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <Label>What can they see?</Label>
          <div className="surface flex items-center justify-between gap-3 rounded-2xl p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                {person.role === 'admin' ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" /> Owner
                  </>
                ) : (
                  <>
                    <UserRound className="h-3.5 w-3.5" /> Employee
                  </>
                )}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">
                {person.role === 'admin'
                  ? 'Sees everyone, reads the report, can add and remove people — including you.'
                  : 'Sees only their own work.'}
              </p>
            </div>
            <Button
              variant="glass"
              size="sm"
              onClick={onToggleRole}
              disabled={Boolean(roleBlocked) || saving}
              className={cn('shrink-0', roleBlocked && 'cursor-not-allowed')}
            >
              {person.role === 'admin' ? 'Make employee' : 'Make owner'}
            </Button>
          </div>
          {roleBlocked && (
            <p role="alert" className="text-[11.5px] leading-relaxed text-ink-muted">
              {roleBlocked}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onSaveDetails} disabled={Boolean(nameProblem) || !detailsChanged || saving} className="gap-2">
            {updateDetails.isPending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
