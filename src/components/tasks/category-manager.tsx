'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Boxes, Loader2, Plus, Shapes, Trash2, Wand2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared/empty-state'
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
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCategories, useDeleteCategory, useDraftWorkPlan, useSaveCategory } from '@/lib/data/queries'
import {
  CATEGORY_COLORS,
  CATEGORY_ICON_KEYS,
  CATEGORY_ICONS,
  categoryStyles,
  TASK_TYPES,
} from '@/lib/task-meta'
import type { TaskCategory } from '@/lib/types'
import { cn, humanMinutes, uid } from '@/lib/utils'
import { categorySchema, type CategoryValues } from '@/lib/validators'

function blank(): CategoryValues {
  return {
    name: '',
    base_type: 'general',
    color: 'violet',
    icon: 'boxes',
    checklist: [
      { id: uid(), label: '', done: false },
      { id: uid(), label: '', done: false },
    ],
    sop: '',
    estimated_minutes: 0,
  }
}

function toValues(category: TaskCategory): CategoryValues {
  return {
    id: category.id,
    name: category.name,
    base_type: category.base_type,
    color: category.color,
    icon: category.icon,
    checklist: category.checklist.length > 0 ? category.checklist : blank().checklist,
    sop: category.sop ?? '',
    estimated_minutes: category.estimated_minutes ?? 0,
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Where a company defines work that Flowline did not ship with — a dispatch
 * run, a factory visit, a payment follow-up. Each one carries its own
 * checklist, procedure and time estimate, so creating that work later is one
 * tap rather than retyping the same thing every week.
 */
export function CategoryManagerDialog({ open, onOpenChange }: Props) {
  const { data: categories, isLoading } = useCategories()
  const save = useSaveCategory()
  const remove = useDeleteCategory()
  const draft = useDraftWorkPlan()

  const [editing, setEditing] = useState<CategoryValues | null>(null)

  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: blank(),
    mode: 'onChange',
  })

  const { fields, append, remove: removeStep, replace } = useFieldArray({ control: form.control, name: 'checklist' })

  useEffect(() => {
    if (!open) setEditing(null)
  }, [open])

  useEffect(() => {
    if (editing) form.reset(editing)
  }, [editing, form])

  const color = form.watch('color')
  const icon = form.watch('icon')
  const name = form.watch('name')
  const minutes = Number(form.watch('estimated_minutes')) || 0

  const styles = categoryStyles(color)
  const PreviewIcon = CATEGORY_ICONS[icon] ?? Boxes

  function startNew() {
    const fresh = blank()
    form.reset(fresh)
    setEditing(fresh)
  }

  function onDraft() {
    const title = form.getValues('name').trim()
    if (title.length < 2) {
      form.setError('name', { message: 'Name the work type first.' })
      return
    }
    draft.mutate(
      { title, taskType: form.getValues('base_type') },
      {
        onSuccess: (result) => {
          form.setValue('sop', result.sop)
          form.setValue('estimated_minutes', result.estimated_minutes)
          replace(result.checklist.map((label) => ({ id: uid(), label, done: false })))
          toast.success(result.ai ? 'Draft written.' : 'Draft prepared from a template.')
        },
      },
    )
  }

  const onSubmit = form.handleSubmit((values) => {
    save.mutate(
      {
        id: values.id,
        name: values.name,
        base_type: values.base_type,
        color: values.color,
        icon: values.icon,
        checklist: values.checklist.filter((c) => c.label.trim().length > 0),
        sop: values.sop?.trim() ? values.sop.trim() : null,
        estimated_minutes: values.estimated_minutes && values.estimated_minutes > 0 ? values.estimated_minutes : null,
      },
      { onSuccess: () => setEditing(null) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shapes className="h-4 w-4 text-primary" />
            Your work types
          </DialogTitle>
          <DialogDescription>
            Add the kinds of work your company actually does. Each one remembers its own checklist, procedure and how
            long it usually takes.
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <form onSubmit={onSubmit} className="space-y-4">
            {/* Live preview — what the tile will look like on a card. */}
            <div className="glass-panel flex items-center gap-3 p-4">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-[13px]', styles.tile)}>
                <PreviewIcon className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-zinc-900">{name || 'New work type'}</p>
                <p className="text-[11.5px] text-zinc-500">
                  Groups with {TASK_TYPES.find((t) => t.value === form.watch('base_type'))?.label}
                  {minutes > 0 && ` · about ${humanMinutes(minutes)}`}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Name</Label>
                <Input id="cat-name" placeholder="Dispatch run" autoFocus {...form.register('name')} />
                {form.formState.errors.name && (
                  <p role="alert" className="text-[12px] text-red-600">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cat-base">Behaves like</Label>
                <Select
                  value={form.watch('base_type')}
                  onValueChange={(v) =>
                    form.setValue('base_type', v as CategoryValues['base_type'], { shouldValidate: true })
                  }
                >
                  <SelectTrigger id="cat-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-zinc-400">Decides which group it sits in on My Day.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-label={c.label}
                    aria-pressed={color === c.key}
                    onClick={() => form.setValue('color', c.key, { shouldValidate: true })}
                    className={cn(
                      'btn-3d h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all',
                      `cat-${c.key} cat-tile`,
                      color === c.key ? 'ring-primary scale-110' : 'ring-transparent',
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_ICON_KEYS.map((key) => {
                  const Icon = CATEGORY_ICONS[key]
                  const active = icon === key
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={key}
                      aria-pressed={active}
                      onClick={() => form.setValue('icon', key, { shouldValidate: true })}
                      className={cn(
                        'btn-3d flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset transition-all',
                        active
                          ? 'bg-primary/10 text-primary ring-primary/30 shadow-raised'
                          : 'bg-zinc-900/[.04] text-zinc-600 ring-zinc-900/[.08] hover:bg-zinc-900/[.07]',
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-minutes">Usually takes (minutes)</Label>
              <Input
                id="cat-minutes"
                type="number"
                min={0}
                max={1440}
                step={5}
                inputMode="numeric"
                placeholder="45"
                className="w-28"
                {...form.register('estimated_minutes')}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Default checklist</Label>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onDraft}
                        disabled={draft.isPending}
                        className="gap-1.5"
                      >
                        {draft.isPending ? <Loader2 className="animate-spin" /> : <Wand2 className="!size-3.5" />}
                        Draft
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Draft the checklist and procedure for me</TooltipContent>
                  </Tooltip>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => append({ id: uid(), label: '', done: false })}
                    disabled={fields.length >= 12}
                    className="gap-1.5"
                  >
                    <Plus className="!size-3.5" />
                    Step
                  </Button>
                </div>
              </div>
              <ul className="space-y-2">
                {fields.map((field, index) => (
                  <li key={field.id} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center text-[12px] tabular-nums text-zinc-400">{index + 1}</span>
                    <Input
                      aria-label={`Step ${index + 1}`}
                      placeholder="What has to happen?"
                      className="h-9 text-[13px]"
                      {...form.register(`checklist.${index}.label` as const)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeStep(index)}
                      aria-label={`Remove step ${index + 1}`}
                      className="shrink-0 text-zinc-400 hover:text-red-600"
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-sop">Standard procedure</Label>
              <Textarea
                id="cat-sop"
                placeholder={'1. Check the register before you start.\n2. Do the work.\n3. Write down what happened.'}
                className="min-h-[110px] font-mono text-[12.5px] leading-relaxed"
                {...form.register('sop')}
              />
              <p className="text-[11.5px] text-zinc-400">Copied onto every job made from this type.</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="glass" onClick={() => setEditing(null)}>
                Back
              </Button>
              <Button type="submit" disabled={save.isPending} className="gap-1.5">
                {save.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                {form.getValues('id') ? 'Save changes' : 'Add work type'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3">
            {isLoading ? (
              <div className="skeleton h-24 w-full rounded-xl" />
            ) : (categories ?? []).length === 0 ? (
              <EmptyState
                icon={Shapes}
                title="No work types of your own yet"
                description="Flowline ships with seven. Add your own for the work that does not fit them — a dispatch run, a factory visit, a payment follow-up."
              />
            ) : (
              <ul className="space-y-2">
                {(categories ?? []).map((category) => {
                  const s = categoryStyles(category.color)
                  const Icon = CATEGORY_ICONS[category.icon] ?? Boxes
                  return (
                    <li key={category.id} className="glass-panel flex items-center gap-3 p-3.5">
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', s.tile)}>
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-zinc-900">{category.name}</p>
                        <p className="truncate text-[11.5px] text-zinc-500">
                          {category.checklist.length} steps
                          {category.estimated_minutes ? ` · ${humanMinutes(category.estimated_minutes)}` : ''}
                          {category.sop ? ' · has a procedure' : ''}
                        </p>
                      </div>
                      <Button type="button" variant="glass" size="sm" onClick={() => setEditing(toValues(category))}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="glass"
                        size="icon-sm"
                        className="text-zinc-400 hover:text-red-600"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate({ categoryId: category.id })}
                        aria-label={`Remove ${category.name}`}
                      >
                        {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}

            <DialogFooter>
              <Button type="button" onClick={startNew} className="gap-1.5">
                <Plus />
                New work type
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
