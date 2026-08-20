import { cn } from '@/lib/utils'

/**
 * Occupies the exact box its content will take, so swapping in real data
 * never shifts the layout.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton', className)} aria-hidden="true" {...props} />
}

export { Skeleton }
