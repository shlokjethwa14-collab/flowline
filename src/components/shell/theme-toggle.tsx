'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme, type Theme } from '@/components/providers/theme-provider'
import { cn } from '@/lib/utils'

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Match device', icon: Monitor },
]

export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="glass" size="icon" aria-label={`Appearance: ${theme}`}>
              {/* Both icons live in the DOM and cross-fade, so the swap has
                  no layout step. */}
              <span className="relative flex h-4 w-4 items-center justify-center">
                <Sun
                  className={cn(
                    'absolute h-4 w-4 transition-all duration-base ease-apple-pop',
                    resolved === 'dark' ? 'scale-0 -rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100',
                  )}
                />
                <Moon
                  className={cn(
                    'absolute h-4 w-4 transition-all duration-base ease-apple-pop',
                    resolved === 'dark' ? 'scale-100 rotate-0 opacity-100' : 'scale-0 rotate-90 opacity-0',
                  )}
                />
              </span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Appearance</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        {OPTIONS.map((option) => {
          const Icon = option.icon
          const active = theme === option.value
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => setTheme(option.value)}
              className={cn(active && 'bg-primary/10 font-medium text-primary')}
            >
              <Icon />
              {option.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
