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
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="glass" size="icon" aria-label="Appearance">
              {/* Both icons live in the DOM and cross-fade, so the swap has
                  no layout step.

                  Which one shows is decided by the `dark` class on <html>
                  through Tailwind's dark: variant, not by the resolved theme
                  in React state. The theme is applied by an inline script
                  before paint, so the server cannot know it — branching on
                  state here produced a hydration mismatch on every load. CSS
                  sidesteps it: the markup is identical either way. */}
              <span className="relative flex h-4 w-4 items-center justify-center">
                <Sun className="absolute h-4 w-4 rotate-0 scale-100 opacity-100 transition-all duration-base ease-apple-pop dark:-rotate-90 dark:scale-0 dark:opacity-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 opacity-0 transition-all duration-base ease-apple-pop dark:rotate-0 dark:scale-100 dark:opacity-100" />
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
