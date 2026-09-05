'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type AllWorkView = 'list' | 'kanban'

interface UIState {
  /** Task whose details sheet is open. */
  openTaskId: string | null
  /** Assign Work dialog; when assigneeId is set the person is preselected. */
  assignOpen: boolean
  assignAssigneeId: string | null
  /** Add-teammate dialog; managerId preselects who they report to. */
  addPersonOpen: boolean
  addPersonManagerId: string | null
  /** Who the remove dialog is about, or null when it is closed. */
  removePersonId: string | null
  /** Call recorder; taskId ties the call to a job when opened from one. */
  callOpen: boolean
  callTaskId: string | null
  callCounterparty: string
  /** Ctrl+K quick add. */
  quickAddOpen: boolean
  /** Mobile navigation drawer. */
  navOpen: boolean

  allWorkView: AllWorkView
  search: string
  employeeFilter: string

  openTask: (taskId: string) => void
  closeTask: () => void
  openAssign: (assigneeId?: string | null) => void
  closeAssign: () => void
  openAddPerson: (managerId?: string | null) => void
  openRemovePerson: (userId: string) => void
  closeRemovePerson: () => void
  closeAddPerson: () => void
  openCall: (taskId?: string | null, counterparty?: string) => void
  closeCall: () => void
  setQuickAdd: (open: boolean) => void
  setNavOpen: (open: boolean) => void
  setAllWorkView: (view: AllWorkView) => void
  setSearch: (value: string) => void
  setEmployeeFilter: (value: string) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      openTaskId: null,
      assignOpen: false,
      assignAssigneeId: null,
      addPersonOpen: false,
      addPersonManagerId: null,
      removePersonId: null,
      callOpen: false,
      callTaskId: null,
      callCounterparty: '',
      quickAddOpen: false,
      navOpen: false,
      allWorkView: 'list',
      search: '',
      employeeFilter: 'all',

      openTask: (taskId) => set({ openTaskId: taskId }),
      closeTask: () => set({ openTaskId: null }),
      openAssign: (assigneeId = null) => set({ assignOpen: true, assignAssigneeId: assigneeId }),
      closeAssign: () => set({ assignOpen: false, assignAssigneeId: null }),
      openAddPerson: (managerId = null) => set({ addPersonOpen: true, addPersonManagerId: managerId }),
      closeAddPerson: () => set({ addPersonOpen: false, addPersonManagerId: null }),
      openRemovePerson: (userId) => set({ removePersonId: userId }),
      closeRemovePerson: () => set({ removePersonId: null }),
      openCall: (taskId = null, counterparty = '') =>
        set({ callOpen: true, callTaskId: taskId, callCounterparty: counterparty }),
      closeCall: () => set({ callOpen: false, callTaskId: null, callCounterparty: '' }),
      setQuickAdd: (open) => set({ quickAddOpen: open }),
      setNavOpen: (open) => set({ navOpen: open }),
      setAllWorkView: (view) => set({ allWorkView: view }),
      setSearch: (value) => set({ search: value }),
      setEmployeeFilter: (value) => set({ employeeFilter: value }),
    }),
    {
      name: 'flowline.ui',
      storage: createJSONStorage(() => localStorage),
      // Only the durable preferences survive a refresh — never open dialogs.
      partialize: (state) => ({ allWorkView: state.allWorkView }),
    },
  ),
)
