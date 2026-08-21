'use client'

import {
  LogOut,
  Menu,
  Mic,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  User,
  UserCog,
  X,
} from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
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
import { useUIStore } from '@/store/ui'
import { ThemeToggle } from './theme-toggle'

/** Desktop: a real field. Mobile: an icon that opens a full-width surface. */
function GlobalSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const search = useUIStore((s) => s.search)
  const setSearch = useUIStore((s) => s.setSearch)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mobileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && open) {
        setOpen(false)
        return
      }
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) mobileRef.current?.focus()
  }, [open])

  function commit(value: string) {
    setSearch(value)
    if (value.trim() && pathname !== '/all-work') router.push('/all-work')
  }

  return (
    <>
      {/* Desktop */}
      <div className="relative hidden w-full max-w-sm md:block">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          aria-hidden="true"
        />
        <Input
          ref={inputRef}
          type="search"
          value={search}
          onChange={(e) => commit(e.target.value)}
          placeholder="Search work…"
          aria-label="Search all work"
          className="h-10 pl-10 pr-10 text-[13.5px]"
        />
        {!search && (
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-500 lg:block">
            /
          </kbd>
        )}
      </div>

      {/* Mobile trigger */}
      <Button
        variant="glass"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Search work"
      >
        <Search />
      </Button>

      {/* Mobile full-width surface */}
      {open && (
        <div className="fixed inset-x-0 top-0 z-50 p-3 md:hidden">
          <div className="glass glass-thick flex items-center gap-2 rounded-2xl p-2 animate-lift-in">
            <Search className="ml-2 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
            <Input
              ref={mobileRef}
              type="search"
              value={search}
              onChange={(e) => commit(e.target.value)}
              placeholder="Search work…"
              aria-label="Search all work"
              className="h-11 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:shadow-none"
            />
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close search">
              <X />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

function AccountMenu() {
  const { profile, email, isAdmin, isDemo, isLoading } = useCurrentUser()

  if (isLoading || !profile) return <Skeleton className="h-10 w-10 rounded-full" />

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-zinc-900/[.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
            <p className="truncate text-[12px] text-zinc-600">{profile.job_title ?? 'Team member'}</p>
          </div>
        </div>
        {email && (
          <p className="truncate px-2.5 pb-2 text-[12px] text-zinc-500" title={email}>
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
                toast.success('Demo reset.')
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

/** Everything that does not earn a permanent slot on a phone. */
function OverflowMenu() {
  const openCall = useUIStore((s) => s.openCall)
  const { isAdmin, isDemo } = useCurrentUser()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="glass" size="icon" className="lg:hidden" aria-label="More actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => openCall(null)}>
          <Mic />
          Log a call
        </DropdownMenuItem>
        {isDemo && (
          <DropdownMenuItem
            onSelect={() => {
              toggleDemoRole()
              toast.success(isAdmin ? 'Viewing as an employee.' : 'Viewing as the owner.')
            }}
          >
            {isAdmin ? <User /> : <ShieldCheck />}
            {isAdmin ? 'Preview as employee' : 'Preview as owner'}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Topbar() {
  const setNavOpen = useUIStore((s) => s.setNavOpen)
  const openAssign = useUIStore((s) => s.openAssign)
  const openCall = useUIStore((s) => s.openCall)
  const { isAdmin, isDemo, profile } = useCurrentUser()

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 lg:px-6">
      <div className="glass glass-thick flex h-16 items-center gap-2 rounded-3xl px-2.5 sm:px-3.5">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu />
        </Button>

        <GlobalSearch />

        <div className="ml-auto flex items-center gap-2">
          {/* Desktop keeps the full set; mobile keeps only the primary
              action and folds the rest into the overflow menu. */}
          <div className="hidden items-center gap-2 lg:flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="glass" size="sm" onClick={() => openCall(null)} className="gap-1.5">
                  <Mic className="text-[color:var(--danger)]" />
                  Log call
                </Button>
              </TooltipTrigger>
              <TooltipContent>Record a call and schedule what was promised</TooltipContent>
            </Tooltip>

            {isDemo && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={() => {
                      toggleDemoRole()
                      toast.success(isAdmin ? 'Viewing as an employee.' : 'Viewing as the owner.')
                    }}
                    className="gap-2"
                    aria-label={`Switch preview role. Currently ${isAdmin ? 'owner' : 'employee'}.`}
                  >
                    {isAdmin ? <ShieldCheck /> : <User />}
                    <span className="text-[12.5px]">{isAdmin ? 'Owner view' : 'Employee view'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Switch between owner and employee</TooltipContent>
              </Tooltip>
            )}
          </div>

          <ThemeToggle />
          <OverflowMenu />

          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => openAssign(null)}
                  className="gap-1.5"
                  aria-label="Quick add — create work"
                >
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
      {profile && <span className="sr-only">Signed in as {profile.full_name}</span>}
    </header>
  )
}
