'use client'

import { Briefcase, Plus, ShieldCheck, UserPlus } from 'lucide-react'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { OrgNode } from '@/hooks/use-flowline'
import { cn, pluralize } from '@/lib/utils'
import { useUIStore } from '@/store/ui'
import { ZoomPan } from './zoom-pan'

interface PersonNodeProps {
  node: OrgNode
  isAdmin: boolean
  /** The root gets a slightly larger, warmer treatment. */
  emphasis?: boolean
}

function PersonNode({ node, isAdmin, emphasis = false }: PersonNodeProps) {
  const openAssign = useUIStore((s) => s.openAssign)
  const openAddPerson = useUIStore((s) => s.openAddPerson)
  const { profile, activeCount } = node

  return (
    <div
      className={cn(
        'glass-card glass-card-hover group relative w-[196px] rounded-2xl p-3.5 text-center sm:w-[212px]',
        emphasis && 'w-[220px] sm:w-[248px]',
      )}
    >
      <button
        type="button"
        onClick={() => openAssign(profile.id)}
        className="flex w-full flex-col items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Assign work to ${profile.full_name}`}
      >
        <PersonAvatar
          profile={profile}
          className={cn('shadow-[0_2px_8px_rgba(24,24,27,.1)]', emphasis ? 'h-14 w-14' : 'h-11 w-11')}
          ring
        />
        <span className="min-w-0">
          <span
            className={cn(
              'block truncate font-semibold leading-tight tracking-[-0.01em] text-zinc-900',
              emphasis ? 'text-[15px]' : 'text-[13.5px]',
            )}
          >
            {profile.full_name}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-zinc-500">{profile.job_title ?? 'Team member'}</span>
        </span>

        <span className="mt-0.5 flex flex-wrap items-center justify-center gap-1.5">
          {profile.role === 'admin' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary ring-1 ring-inset ring-primary/20">
              <ShieldCheck className="h-2.5 w-2.5" />
              Admin
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset',
              activeCount === 0
                ? 'bg-zinc-100 text-zinc-500 ring-zinc-200/70'
                : 'bg-amber-50 text-amber-700 ring-amber-200/70',
            )}
          >
            <Briefcase className="h-2.5 w-2.5" />
            {activeCount} {pluralize(activeCount, 'open job')}
          </span>
        </span>
      </button>

      {isAdmin && (
        <div className="mt-3 flex items-center justify-center gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="glass" className="h-7 gap-1 px-2" onClick={() => openAssign(profile.id)}>
                <Plus className="!size-3" />
                <span className="text-[11.5px]">Assign</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Give {profile.full_name.split(' ')[0]} a job</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="glass"
                className="h-7 w-7"
                onClick={() => openAddPerson(profile.id)}
                aria-label={`Add someone under ${profile.full_name}`}
              >
                <UserPlus className="!size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add someone under {profile.full_name.split(' ')[0]}</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )
}

function Branch({ node, isAdmin, depth = 0 }: { node: OrgNode; isAdmin: boolean; depth?: number }) {
  const hasChildren = node.children.length > 0

  return (
    <div className="flex flex-col items-center">
      <PersonNode node={node} isAdmin={isAdmin} emphasis={depth === 0} />

      {hasChildren && (
        <>
          {/* Stem down from this person to the bar across their reports. */}
          <div className="org-line h-7 w-px" aria-hidden="true" />

          <div className="flex items-start justify-center">
            {node.children.map((child) => (
              <div
                key={child.profile.id}
                className={cn(
                  'relative px-2 pt-7 sm:px-3',
                  // The two halves of the horizontal bar; outer halves are
                  // hidden on the first and last child so the bar stops there.
                  "before:absolute before:right-1/2 before:top-0 before:h-px before:w-1/2 before:bg-zinc-300/60 before:content-['']",
                  "after:absolute after:left-1/2 after:top-0 after:h-px after:w-1/2 after:bg-zinc-300/60 after:content-['']",
                  'first:before:hidden last:after:hidden',
                )}
              >
                {/* Stem from the bar down into the child card. */}
                <div
                  className="org-line absolute left-1/2 top-0 h-7 w-px -translate-x-1/2"
                  aria-hidden="true"
                />
                <Branch node={child} isAdmin={isAdmin} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

interface OrgChartProps {
  roots: OrgNode[]
  orphans: OrgNode[]
  isAdmin: boolean
  isLoading: boolean
}

export function OrgChart({ roots, orphans, isAdmin, isLoading }: OrgChartProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-7 py-6">
        <Skeleton className="h-[150px] w-[248px] rounded-2xl" />
        <div className="flex gap-5">
          <Skeleton className="h-[136px] w-[212px] rounded-2xl" />
          <Skeleton className="h-[136px] w-[212px] rounded-2xl" />
          <Skeleton className="h-[136px] w-[212px] rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <ZoomPan>
      <div className="flex min-w-max flex-col items-center gap-10 px-4 py-6 stagger">
        {roots.map((root) => (
          <Branch key={root.profile.id} node={root} isAdmin={isAdmin} />
        ))}

        {orphans.length > 0 && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-[11.5px] uppercase tracking-wider text-zinc-400">Not linked to a manager</p>
            <div className="flex flex-wrap items-start justify-center gap-4">
              {orphans.map((node) => (
                <Branch key={node.profile.id} node={node} isAdmin={isAdmin} depth={1} />
              ))}
            </div>
          </div>
        )}
      </div>
    </ZoomPan>
  )
}
