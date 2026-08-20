import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="space-y-1.5">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.022em] text-zinc-900 sm:text-[30px]">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-[14px] leading-relaxed text-zinc-500 text-pretty">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )
}
