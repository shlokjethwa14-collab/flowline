'use client'

import { useEffect, type ReactNode } from 'react'
import { CallRecorderDialog } from '@/components/calls/call-recorder-dialog'
import { PageShell } from '@/components/motion/page-shell'
import { AmbientField } from './ambient-field'
import { AddPersonDialog } from '@/components/team/add-person-dialog'
import { ChangeRoleDialog } from '@/components/team/change-role-dialog'
import { RemovePersonDialog } from '@/components/team/remove-person-dialog'
import { AssignWorkDialog } from '@/components/tasks/assign-work-dialog'
import { TaskDetailsSheet } from '@/components/tasks/task-details-sheet'
import { useCurrentUser } from '@/hooks/use-flowline'
import { useDayRollForward, useProfiles, useRealtimeSync } from '@/lib/data/queries'
import { useUIStore } from '@/store/ui'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

/** Ctrl/Cmd+K opens Quick Add — admins only, since employees cannot create work. */
function useQuickAddShortcut(enabled: boolean) {
  const openAssign = useUIStore((s) => s.openAssign)

  useEffect(() => {
    if (!enabled) return
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      openAssign(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, openAssign])
}

export function AppShell({ children }: { children: ReactNode }) {
  const { isAdmin } = useCurrentUser()
  const callOpen = useUIStore((s) => s.callOpen)
  const callTaskId = useUIStore((s) => s.callTaskId)
  const callCounterparty = useUIStore((s) => s.callCounterparty)
  const closeCall = useUIStore((s) => s.closeCall)

  useRealtimeSync()
  useDayRollForward(isAdmin)
  useQuickAddShortcut(isAdmin)

  return (
    <>
      {/* The ground the glass reacts to — outside the wrapper below on
          purpose. `perspective` makes an element the containing block for
          its fixed descendants, so inside it this canvas stretched to the
          full document height instead of staying pinned to the viewport. */}
      <AmbientField />

      <div className="depth-scene relative min-h-dvh lg:pl-[264px]">
        {/* Content dissolves into the background beneath the floating topbar
            rather than sliding under a hard edge. */}
        <div className="scroll-edge z-20" aria-hidden="true" />

      <Sidebar />
      <Topbar />

      <main className="relative z-10 px-3 pb-16 pt-5 sm:px-4 lg:px-6">
        {/* Wide enough for the report and the board to breathe on a large
            display; the cap only stops line lengths running away past 2K. */}
        <div className="mx-auto w-full max-w-[1680px]">
          <PageShell>{children}</PageShell>
        </div>
      </main>

      {/* One instance of each overlay, shared by every screen. */}
      <TaskDetailsSheet />
      <CallRecorderDialog
        open={callOpen}
        onOpenChange={(next) => !next && closeCall()}
        taskId={callTaskId}
        defaultCounterparty={callCounterparty}
      />
        {isAdmin && <AssignWorkDialog />}
        {isAdmin && <AddPersonDialog />}
        {isAdmin && <RemovePersonTarget />}
        {isAdmin && <ChangeRoleTarget />}
      </div>
    </>
  )
}

/**
 * Resolves the id held in the UI store to the actual person, so the dialog
 * can be mounted once here rather than per node in the chart.
 */
function RemovePersonTarget() {
  const removePersonId = useUIStore((s) => s.removePersonId)
  const closeRemovePerson = useUIStore((s) => s.closeRemovePerson)
  const { data: profiles } = useProfiles()
  const person = (profiles ?? []).find((p) => p.id === removePersonId) ?? null

  return (
    <RemovePersonDialog
      // Remounts per person, so the reassign picker starts clean each time.
      key={removePersonId ?? 'none'}
      person={person}
      open={Boolean(removePersonId)}
      onOpenChange={(next) => !next && closeRemovePerson()}
    />
  )
}

/** Same pattern as RemovePersonTarget: one mounted dialog, id-driven. */
function ChangeRoleTarget() {
  const changeRolePersonId = useUIStore((s) => s.changeRolePersonId)
  const closeChangeRole = useUIStore((s) => s.closeChangeRole)
  const { data: profiles } = useProfiles()
  const person = (profiles ?? []).find((p) => p.id === changeRolePersonId) ?? null

  return (
    <ChangeRoleDialog
      key={changeRolePersonId ?? 'none'}
      person={person}
      open={Boolean(changeRolePersonId)}
      onOpenChange={(next) => !next && closeChangeRole()}
    />
  )
}
