'use client'

import { Waves } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/use-flowline'
import type { Role } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui'
import { navFor } from './nav-items'

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-2xl',
          'bg-gradient-to-br from-[hsl(250_84%_68%)] to-[hsl(250_84%_54%)] text-white',
          'shadow-[0_2px_5px_rgba(24,24,27,.1),0_8px_20px_-6px_rgba(109,88,240,.55),inset_0_1px_0_rgba(255,255,255,.4)]',
        )}
      >
        <Waves className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <p className="text-[17px] font-semibold leading-none tracking-[-0.02em] text-zinc-900">Flowline</p>
        <p className="mt-1 truncate text-[11.5px] text-zinc-400">Daily work, kept simple</p>
      </div>
    </div>
  )
}

function NavList({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname()
  const items = navFor(role)

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all duration-250 ease-spring',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              active
                ? 'bg-gradient-to-b from-white to-zinc-50/80 text-zinc-900 shadow-raised'
                : 'text-zinc-500 hover:bg-white/60 hover:text-zinc-800',
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[hsl(250_84%_68%)] to-[hsl(250_84%_56%)]"
              />
            )}
            <Icon
              className={cn(
                'mt-0.5 h-[18px] w-[18px] shrink-0 transition-colors',
                active ? 'text-primary' : 'text-zinc-400 group-hover:text-zinc-600',
              )}
              strokeWidth={1.9}
            />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium leading-tight">{item.label}</span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-zinc-400">{item.description}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, isDemo, isLoading } = useCurrentUser()

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="pt-2">
        <Brand />
      </div>

      <div className="h-px hairline" />

      {isLoading || !profile ? (
        <div className="flex flex-col gap-2 px-1">
          <Skeleton className="h-[58px] w-full rounded-xl" />
          <Skeleton className="h-[58px] w-full rounded-xl" />
          <Skeleton className="h-[58px] w-full rounded-xl" />
          <Skeleton className="h-[58px] w-full rounded-xl" />
        </div>
      ) : (
        <NavList role={profile.role} onNavigate={onNavigate} />
      )}

      <div className="mt-auto space-y-3 px-1">
        {isDemo && (
          <div className="rounded-xl border border-white/80 bg-gradient-to-b from-amber-50/90 to-amber-100/60 p-3 shadow-glass-sm">
            <Badge variant="warning" className="mb-1.5">
              Demo mode
            </Badge>
            <p className="text-[11.5px] leading-relaxed text-amber-900/80">
              Sample company, stored only in this browser. Add your Supabase keys to connect a real database.
            </p>
          </div>
        )}
        {profile && (
          <p className="px-2 text-[11px] leading-relaxed text-zinc-400">
            Signed in as <span className="font-medium text-zinc-600">{profile.job_title ?? profile.full_name}</span>
          </p>
        )}
      </div>
    </div>
  )
}

export function Sidebar() {
  const navOpen = useUIStore((s) => s.navOpen)
  const setNavOpen = useUIStore((s) => s.setNavOpen)

  return (
    <>
      {/* Laptop and up: a permanent glass rail. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] p-3 lg:block">
        <div className="glass glass-edge h-full rounded-2xl">
          <SidebarBody />
        </div>
      </aside>

      {/* Phones and tablets: the same rail as a drawer. */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-[280px] p-0 sm:max-w-[280px]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Move between the sections of Flowline.</SheetDescription>
          <SidebarBody onNavigate={() => setNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
