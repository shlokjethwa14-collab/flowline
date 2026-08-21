'use client'

import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Inbox } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { TASK_STATUSES } from '@/lib/task-meta'
import type { Task, TaskStatus } from '@/lib/types'
import { cn, dueState } from '@/lib/utils'
import { useUpdateTaskStatus } from '@/lib/data/queries'
import { TaskCard, TaskCardSkeleton } from './task-card'

interface KanbanBoardProps {
  tasks: Task[]
  isLoading: boolean
  showAssignee?: boolean
  /** Phone layout: columns snap horizontally instead of stacking. */
  narrow?: boolean
}

export function KanbanBoard({ tasks, isLoading, showAssignee = true, narrow = false }: KanbanBoardProps) {
  const updateStatus = useUpdateTaskStatus()

  const columns = useMemo(() => {
    const byStatus = new Map<TaskStatus, Task[]>(TASK_STATUSES.map((s) => [s.value, []]))
    const urgency: Record<string, number> = { overdue: 0, today: 1, 'due-soon': 2, upcoming: 3, none: 4 }
    const sorted = [...tasks].sort((a, b) => {
      if (a.is_blocked !== b.is_blocked) return a.is_blocked ? -1 : 1
      return urgency[dueState(a)] - urgency[dueState(b)]
    })
    for (const task of sorted) byStatus.get(task.status)?.push(task)
    return byStatus
  }, [tasks])

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination || destination.droppableId === source.droppableId) return
    updateStatus.mutate({ taskId: draggableId, status: destination.droppableId as TaskStatus })
  }

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => (
          <div key={status.value} className="space-y-3">
            <div className="skeleton h-11 w-full rounded-2xl" />
            <TaskCardSkeleton />
          </div>
        ))}
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing on the board"
        description="Once work is assigned it appears here, and you can move it between the four stages."
      />
    )
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div
        className={cn(
          // The board scrolls inside itself, never the document. On a phone
          // each column is a snap target, so four stages stay four screens
          // wide instead of one very long page.
          narrow
            ? 'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4',
        )}
      >
        {TASK_STATUSES.map((status) => {
          const items = columns.get(status.value) ?? []
          return (
            <Droppable droppableId={status.value} key={status.value}>
              {(provided, snapshot) => (
                <section
                  aria-label={`${status.label}, ${items.length} ${items.length === 1 ? 'job' : 'jobs'}`}
                  className={cn(
                    'flex flex-col rounded-3xl transition-colors duration-200',
                    narrow && 'w-[82vw] shrink-0 snap-start',
                    snapshot.isDraggingOver && 'bg-zinc-900/[.04] ring-1 ring-zinc-900/10',
                  )}
                >
                  <header className="glass glass-thin sticky top-[72px] z-10 mb-3 flex items-center gap-2 rounded-2xl px-4 py-3">
                    <span className={cn('h-2 w-2 rounded-full', status.dot)} aria-hidden="true" />
                    <h3 className="text-[13.5px] font-semibold text-zinc-800">{status.label}</h3>
                    <span className="ml-auto rounded-full bg-zinc-900/[.06] px-2 py-0.5 text-[12px] font-semibold tabular-nums text-zinc-600">
                      {items.length}
                    </span>
                  </header>

                  <div ref={provided.innerRef} {...provided.droppableProps} className="flex min-h-[110px] flex-col gap-3 pb-2">
                    {items.map((task, index) => (
                      <Draggable draggableId={task.id} index={index} key={task.id}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={dragProvided.draggableProps.style}
                            className={cn(
                              'transition-transform duration-200 ease-apple',
                              dragSnapshot.isDragging && 'scale-[1.02] [&>*]:shadow-glass-lg',
                            )}
                          >
                            <TaskCard task={task} showAssignee={showAssignee} compact showStagePicker />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}

                    {items.length === 0 && !snapshot.isDraggingOver && (
                      <p className="rounded-2xl border border-dashed border-zinc-300/70 px-3 py-6 text-center text-[12.5px] text-zinc-400">
                        Nothing here
                      </p>
                    )}
                  </div>
                </section>
              )}
            </Droppable>
          )
        })}
      </div>

      {narrow && (
        <p className="mt-1 px-1 text-[12px] text-zinc-500">Swipe sideways to see the other stages.</p>
      )}
    </DragDropContext>
  )
}
