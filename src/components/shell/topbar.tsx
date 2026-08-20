'use client'

import { LogOut, Menu, Plus, RotateCcw, Search, ShieldCheck, User, UserCog } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrentUser } from '@/hooks/use-flowline'
import { resetDemo, toggleDemoRole } from '@/lib/demo/store'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui'

function GlobalSearch() {
  const router = useRouter()
  const search = useUIStore((s) => s.search)
  const setSearch = useUIStore((s) => s.setSearch)
  const inputRef = useRef<HTMLInputElement>(null)

  // "/" focuses search, the way every tool the team already uses behaves.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative w-full max-w-md">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => router.push('/all-work')}
        placeholder="Search work…"
        aria-label="Search all work"
        className="h-9 pl-9 pr-10 text-[13.5px]"
      />
      {!search && (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-zinc-200 bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-400 sm:block">
          /
        </kbd>
      )}
    </div>
  )
}

function DemoRoleSwitch() {
  const { profile } = useCurrentUser()
  const [busy, setBusy] = useState(false)
  const isAdmin = profile?.role === 'admin'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="glass"
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            toggleDemoRole()
            toast.success(isAdmin ? 'Viewing as an employee.' : 'Viewing as the owner.', {
              description: isAdmin
                ? 'Admin navigation and controls are now hidden.'
                : 'You can see the whole company again.',
            })
            setTimeout(() => setBusy(false), 250)
          }}
          className="gap-2"
        >
          {isAdmin ? <ShieldCheck className="text-primary" /> : <User className="text-zinc-500" />}
          <span className="hidden text-[12.5px] sm:inline">{isAdmin ? 'Owner view' : 'Employee view'}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Switch the preview between owner and employee</TooltipContent>
    </Tooltip>
  )
}

function AccountMenu() {
  const { profile, email, isAdmin, isDemo, isLoading } = useCurrentUser()

  if (isLoading || !profile) {
    return <Skeleton className="h-9 w-9 rounded-full" />
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'btn-3d flex items-center gap-2 rounded-full p-0.5 pr-1 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'hover:bg-zinc-900/[.05]',
          )}
          aria-label={`Account menu for ${profile.full_name}`}
        >
          <PersonAvatar profile={profile} className="h-9 w-9" ring />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <PersonAvatar profile={profile} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-zinc-900">{profile.full_name}</p>
            <p className="truncate text-[11.5px] text-zinc-500">{profile.job_title ?? 'Team member'}</p>
          </div>
        </div>
        {email && (
          <p className="truncate px-2.5 pb-2 text-[11.5px] text-zinc-400" title={email}>
            {email}
          </p>
        )}
        <div className="px-2.5 pb-2">
          <Badge variant={isAdmin ? 'primary' : 'default'}>
            {isAdmin ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {isAdmin ? 'Owner / Admin' : 'Employee'}
          </Badge>
        </div>
        <DropdownMenuSeparator />

        {isDemo ? (
          <>
            <DropdownMenuLabel>Demo controls</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                toggleDemoRole()
                toast.success('Switched preview role.')
              }}
            >
              <UserCog />
              {isAdmin ? 'Preview as employee' : 'Preview as owner'}
            </DropdownMenuItem>
            <DropdownMenuItem
              destructive
              onSelect={() => {
                resetDemo()
                toast.success('Demo reset.', { description: 'The sample company is back to its starting state.' })
              }}
            >
              <RotateCcw />
              Reset demo data
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem asChild>
            <a href="/auth/sign-out">
              <LogOut />
              Sign out
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Topbar() {
  const setNavOpen = useUIStore((s) => s.setNavOpen)
  const setQuickAdd = useUIStore((s) => s.setQuickAdd)
  const { isAdmin, isDemo } = useCurrentUser()

  return (
    <header className="sticky top-0 z-20 px-3 pt-3 lg:px-6">
      <div className="glass glass-edge flex h-14 items-center gap-2 rounded-2xl px-2.5 sm:gap-3 sm:px-3.5">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation"
        >
          <Menu />
        </Button>

        <GlobalSearch />

        <div className="ml-auto flex items-center gap-2">
          {isDemo && <DemoRoleSwitch />}

          {/* Quick Add creates work, so only an admin ever sees it. */}
          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" onClick={() => setQuickAdd(true)} className="gap-1.5">
                  <Plus />
                  <span className="hidden sm:inline">Quick Add</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Create work · <span className="font-mono">Ctrl</span> + <span className="font-mono">K</span>
              </TooltipContent>
            </Tooltip>
          )}

          <AccountMenu />
        </div>
      </div>
    </header>
  )
}
