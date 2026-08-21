'use client'

import { useEffect, type ReactNode } from 'react'
import { CallRecorderDialog } from '@/components/calls/call-recorder-dialog'
import { AddPersonDialog } from '@/components/team/add-person-dialog'
import { AssignWorkDialog } from '@/components/tasks/assign-work-dialog'
import { TaskDetailsSheet } from '@/components/tasks/task-details-sheet'
import { useCurrentUser } from '@/hooks/use-flowline'
import { useDayRollForward, useRealtimeSync } from '@/lib/data/queries'
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
    <div className="depth-scene min-h-dvh lg:pl-[264px]">
      <Sidebar />
      <Topbar />

      <main className="px-3 pb-16 pt-5 sm:px-4 lg:px-6">
        <div className="mx-auto w-full max-w-[1400px]">{children}</div>
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
    </div>
  )
}
