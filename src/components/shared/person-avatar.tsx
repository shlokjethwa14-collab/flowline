'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { Profile } from '@/lib/types'
import { cn, initials } from '@/lib/utils'

/** Deterministic tint per person, so the same face always reads the same. */
const TINTS = [
  'from-violet-100 to-violet-200 text-violet-700',
  'from-sky-100 to-sky-200 text-sky-700',
  'from-emerald-100 to-emerald-200 text-emerald-700',
  'from-amber-100 to-amber-200 text-amber-700',
  'from-rose-100 to-rose-200 text-rose-700',
  'from-teal-100 to-teal-200 text-teal-700',
  'from-indigo-100 to-indigo-200 text-indigo-700',
  'from-fuchsia-100 to-fuchsia-200 text-fuchsia-700',
]

function tintFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return TINTS[hash % TINTS.length]
}

interface PersonAvatarProps {
  profile: Pick<Profile, 'id' | 'full_name'> | null
  className?: string
  /** Adds a soft white ring, for avatars sitting on tinted surfaces. */
  ring?: boolean
}

export function PersonAvatar({ profile, className, ring = false }: PersonAvatarProps) {
  const name = profile?.full_name ?? 'Unassigned'
  return (
    <Avatar className={cn(ring && 'ring-2 ring-white/90', className)}>
      <AvatarFallback
        className={cn('bg-gradient-to-br', profile ? tintFor(profile.id) : 'from-zinc-100 to-zinc-200 text-zinc-500')}
        aria-label={name}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

/** Overlapping row of faces, used on the routine and team summaries. */
export function AvatarStack({ profiles, max = 4 }: { profiles: Profile[]; max?: number }) {
  const shown = profiles.slice(0, max)
  const extra = profiles.length - shown.length
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((p) => (
        <PersonAvatar key={p.id} profile={p} className="h-7 w-7" ring />
      ))}
      {extra > 0 && (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-500 ring-2 ring-white/90">
          +{extra}
        </span>
      )}
    </div>
  )
}
