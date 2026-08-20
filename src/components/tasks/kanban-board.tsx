'use client'

import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Inbox } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { TASK_STATUSES } from '@/lib/task-meta'
import type { Task, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useUpdateTaskStatus } from '@/lib/data/queries'
import { TaskCard, TaskCardSkeleton } from './task-card'

interface KanbanBoardProps {
  tasks: Task[]
  isLoading: boolean
  showAssignee?: boolean
}

export function KanbanBoard({ tasks, isLoading, showAssignee = true }: KanbanBoardProps) {
  const updateStatus = useUpdateTaskStatus()

  const columns = useMemo(() => {
    const byStatus = new Map<TaskStatus, Task[]>(TASK_STATUSES.map((s) => [s.value, []]))
    const sorted = [...tasks].sort((a, b) => {
      // Blocked first, then soonest deadline, then newest.
      if (a.is_blocked !== b.is_blocked) return a.is_blocked ? -1 : 1
      const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY
      const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY
      if (aDue !== bDue) return aDue - bDue
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    for (const task of sorted) {
      byStatus.get(task.status)?.push(task)
    }
    return byStatus
  }, [tasks])

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId) return
    const nextStatus = destination.droppableId as TaskStatus
    updateStatus.mutate({ taskId: draggableId, status: nextStatus })
  }

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => (
          <div key={status.value} className="space-y-3">
            <div className="glass-panel px-3.5 py-2.5">
              <div className="skeleton h-4 w-20" />
            </div>
            <TaskCardSkeleton />
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
        description="Once work is assigned it will appear here, and you can drag it between the four stages."
      />
    )
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => {
          const items = columns.get(status.value) ?? []
          return (
            <Droppable droppableId={status.value} key={status.value}>
              {(provided, snapshot) => (
                <section
                  aria-label={`${status.label} column`}
                  className={cn(
                    'flex flex-col rounded-2xl transition-colors duration-200',
                    snapshot.isDraggingOver && 'bg-primary/[.05] ring-1 ring-primary/15',
                  )}
                >
                  <header
                    className={cn(
                      'glass glass-edge sticky top-[74px] z-10 mb-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5',
                      'bg-gradient-to-b',
                      status.column,
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full', status.dot)} aria-hidden="true" />
                    <h3 className="text-[13px] font-semibold text-zinc-800">{status.label}</h3>
                    <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-500 shadow-glass-sm">
                      {items.length}
                    </span>
                  </header>

                  <div ref={provided.innerRef} {...provided.droppableProps} className="flex min-h-[120px] flex-col gap-3 pb-2">
                    {items.map((task, index) => (
                      <Draggable draggableId={task.id} index={index} key={task.id}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={dragProvided.draggableProps.style}
                            className={cn(
                              'transition-shadow',
                              dragSnapshot.isDragging && '[&>*]:shadow-glass-lg [&>*]:ring-1 [&>*]:ring-primary/20',
                            )}
                          >
                            <TaskCard task={task} showAssignee={showAssignee} compact />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}

                    {items.length === 0 && !snapshot.isDraggingOver && (
                      <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-[12px] text-zinc-400">
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
    </DragDropContext>
  )
}
