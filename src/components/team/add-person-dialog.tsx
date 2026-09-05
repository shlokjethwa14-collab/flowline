'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, ShieldCheck, UserPlus, UserRound } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentUser } from '@/hooks/use-flowline'
import { generatePassword } from '@/lib/accounts'
import { useAddEmployee, useProfiles } from '@/lib/data/queries'
import type { Role } from '@/lib/types'
import { cn } from '@/lib/utils'
import { addEmployeeSchema, type AddEmployeeValues } from '@/lib/validators'
import { useUIStore } from '@/store/ui'

const NO_MANAGER = '__none__'

const SUGGESTED_TITLES = [
  'Production Manager',
  'Sales Manager',
  'Cutting Master',
  'Stock Coordinator',
  'Sales Executive',
  'Data Entry Operator',
]

export function AddPersonDialog() {
  const open = useUIStore((s) => s.addPersonOpen)
  const managerId = useUIStore((s) => s.addPersonManagerId)
  const close = useUIStore((s) => s.closeAddPerson)

  const { isAdmin, isDemo } = useCurrentUser()
  const { data: profiles } = useProfiles()
  const addEmployee = useAddEmployee()

  const form = useForm<AddEmployeeValues>({
    resolver: zodResolver(addEmployeeSchema),
    defaultValues: { full_name: '', job_title: '', login_id: '', password: generatePassword(), reports_to: managerId, role: 'employee' },
    mode: 'onChange',
  })

  useEffect(() => {
    if (open) {
      // A fresh password each time the dialog opens, so an owner adding
      // three people in a row does not give all three the same one.
      form.reset({ full_name: '', job_title: '', login_id: '', password: generatePassword(), reports_to: managerId, role: 'employee' })
    }
  }, [open, managerId, form])

  const manager = useMemo(
    () => (profiles ?? []).find((p) => p.id === form.watch('reports_to')) ?? null,
    [profiles, form],
  )

  const role = form.watch('role')

  const onSubmit = form.handleSubmit((values) => {
    addEmployee.mutate(
      {
        full_name: values.full_name.trim(),
        job_title: values.job_title.trim(),
        login_id: values.login_id.trim().toLowerCase(),
        password: values.password,
        reports_to: values.reports_to,
        role: values.role,
      },
      { onSuccess: close },
    )
  })

  if (!isAdmin) return null

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            Add a teammate
          </DialogTitle>
          <DialogDescription>
            {isDemo
              ? 'They appear on the chart straight away. Nothing is sent anywhere.'
              : 'Give them the login ID and password below. Nothing is emailed — Flowline sends no mail at all.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="person-name">Full name</Label>
            <Input
              id="person-name"
              autoFocus
              placeholder="Kavita Patil"
              aria-invalid={Boolean(form.formState.errors.full_name)}
              {...form.register('full_name')}
            />
            {form.formState.errors.full_name && (
              <p role="alert" className="text-[12px] text-red-600">
                {form.formState.errors.full_name.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-title">What do they do?</Label>
            <Input
              id="person-title"
              placeholder="Stock Coordinator"
              list="suggested-titles"
              aria-invalid={Boolean(form.formState.errors.job_title)}
              {...form.register('job_title')}
            />
            <datalist id="suggested-titles">
              {SUGGESTED_TITLES.map((title) => (
                <option key={title} value={title} />
              ))}
            </datalist>
            {form.formState.errors.job_title && (
              <p role="alert" className="text-[12px] text-red-600">
                {form.formState.errors.job_title.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-login-id">Login ID</Label>
            <Input
              id="person-login-id"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              placeholder="kavita"
              aria-invalid={Boolean(form.formState.errors.login_id)}
              aria-describedby={form.formState.errors.login_id ? 'person-login-id-error' : 'person-login-id-hint'}
              {...form.register('login_id')}
            />
            {form.formState.errors.login_id ? (
              <p id="person-login-id-error" role="alert" className="text-[12px] text-red-600">
                {form.formState.errors.login_id.message}
              </p>
            ) : (
              <p id="person-login-id-hint" className="text-[11.5px] text-zinc-500">
                What they type to sign in. No email needed.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="person-password">Password</Label>
              {/* Generated rather than typed: an owner inventing twenty
                  passwords produces twenty variations of the company name. */}
              <Button
                type="button"
                variant="glass"
                size="sm"
                onClick={() => form.setValue('password', generatePassword(), { shouldValidate: true })}
              >
                Generate
              </Button>
            </div>
            <Input
              id="person-password"
              // Shown, not masked: the owner has to read this out or write it
              // down. A masked field they cannot check is how the wrong
              // password gets handed over.
              type="text"
              autoComplete="off"
              aria-invalid={Boolean(form.formState.errors.password)}
              aria-describedby={form.formState.errors.password ? 'person-password-error' : 'person-password-hint'}
              {...form.register('password')}
            />
            {form.formState.errors.password ? (
              <p id="person-password-error" role="alert" className="text-[12px] text-red-600">
                {form.formState.errors.password.message}
              </p>
            ) : (
              <p id="person-password-hint" className="text-[11.5px] text-zinc-500">
                Give this to them directly. You can change it later; they cannot reset it themselves.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-manager">Who do they report to?</Label>
            <Select
              value={form.watch('reports_to') ?? NO_MANAGER}
              onValueChange={(value) =>
                form.setValue('reports_to', value === NO_MANAGER ? null : value, { shouldValidate: true })
              }
            >
              <SelectTrigger id="person-manager">
                <SelectValue placeholder="Choose a manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MANAGER}>Nobody — they sit at the top</SelectItem>
                {(profiles ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name} · {p.job_title ?? 'Team'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {manager && (
              <p className="text-[11.5px] text-zinc-400">
                They will appear directly under {manager.full_name} on the flowchart.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>What can they see?</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    value: 'employee' as Role,
                    label: 'Employee',
                    hint: 'Only their own work',
                    icon: UserRound,
                  },
                  {
                    value: 'admin' as Role,
                    label: 'Owner / Admin',
                    hint: 'The whole company',
                    icon: ShieldCheck,
                  },
                ] as const
              ).map((option) => {
                const Icon = option.icon
                const active = role === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => form.setValue('role', option.value, { shouldValidate: true })}
                    className={cn(
                      'btn-3d flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition-all',
                      active
                        ? 'bg-primary/10 text-primary shadow-raised ring-primary/25'
                        : 'bg-zinc-900/[.04] text-zinc-600 ring-zinc-900/[.08] hover:bg-zinc-900/[.07]',
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
                    <span>
                      <span className="block text-[13px] font-medium leading-tight">{option.label}</span>
                      <span className="mt-0.5 block text-[11px] text-zinc-400">{option.hint}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="glass" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={addEmployee.isPending} className="gap-1.5">
              {addEmployee.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Add teammate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
