'use client'

import { ArrowRightLeft, MousePointerClick, UserPlus, Users } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { AdminOnly } from '@/components/shell/role-guard'
import { OrgChart } from '@/components/team/org-chart'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser, useOrgTree } from '@/hooks/use-flowline'
import { useUIStore } from '@/store/ui'

function Hint({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-[12px] text-zinc-500 ring-1 ring-inset ring-zinc-200/70">
      <Icon className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.9} />
      {children}
    </span>
  )
}

function TeamFlowContent() {
  const { roots, orphans, isLoading } = useOrgTree()
  const { isAdmin } = useCurrentUser()
  const openAddPerson = useUIStore((s) => s.openAddPerson)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Flow"
        description="Everyone in the company, top to bottom. Tap a person to give them a job, or add someone underneath a manager."
        action={
          <Button onClick={() => openAddPerson(null)} className="gap-1.5">
            <UserPlus />
            Add teammate
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Hint icon={MousePointerClick}>Tap anyone to assign work</Hint>
        <Hint icon={Users}>The number shows open jobs</Hint>
        <Hint icon={ArrowRightLeft}>Anyone can pass work on, with a reason</Hint>
      </div>

      <section className="glass-panel">
        <OrgChart roots={roots} orphans={orphans} isAdmin={isAdmin} isLoading={isLoading} />
      </section>
    </div>
  )
}

export default function TeamFlowPage() {
  return (
    <AdminOnly
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-[420px] w-full rounded-2xl" />
        </div>
      }
    >
      <TeamFlowContent />
    </AdminOnly>
  )
}
