'use client'

import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      offset={16}
      duration={4200}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group glass glass-edge !rounded-2xl !shadow-glass-lg !border-white/90 !text-zinc-800 !text-[13.5px] !gap-3 !p-4',
          title: '!font-semibold !text-zinc-900',
          description: '!text-zinc-500 !text-[12.5px] !leading-relaxed',
          actionButton: '!bg-primary !text-white !rounded-lg !text-[12px]',
          cancelButton: '!bg-zinc-100 !text-zinc-600 !rounded-lg !text-[12px]',
          closeButton: '!bg-white !border-zinc-200 !text-zinc-500 hover:!text-zinc-800',
          success: '[&_[data-icon]]:!text-emerald-500',
          error: '[&_[data-icon]]:!text-red-500',
        },
      }}
      {...props}
    />
  )
}
