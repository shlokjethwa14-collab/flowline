import { describe, expect, it } from 'vitest'
import {
  addDaysKey,
  dueState,
  endOfMonthKey,
  endOfWeekKey,
  parseDayKey,
  startOfWeekKey,
  toDayKey,
} from '@/lib/utils'
import type { Task } from '@/lib/types'

/** A minimal task, since dueState only reads three fields. */
function task(partial: Partial<Task>): Pick<Task, 'due_date' | 'status' | 'horizon'> {
  return {
    due_date: partial.due_date ?? null,
    status: partial.status ?? 'todo',
    horizon: partial.horizon ?? 'day',
  }
}

describe('date keys', () => {
  it('parses a day key as local, not UTC', () => {
    // `new Date('2026-08-28')` is UTC midnight per spec, which is already the
    // 27th anywhere west of Greenwich. parseDayKey must not do that.
    const d = parseDayKey('2026-08-28')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(28)
  })

  it('round-trips through toDayKey unchanged', () => {
    for (const key of ['2026-01-01', '2026-02-28', '2026-03-08', '2026-12-31']) {
      expect(toDayKey(parseDayKey(key))).toBe(key)
    }
  })

  it('anchors at midday so day arithmetic survives a DST shift', () => {
    // 8 March 2026 is a US spring-forward date. Anchored at 00:00 a +1 day
    // step can land back on the same date; at midday it cannot.
    expect(addDaysKey('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDaysKey('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDaysKey('2026-10-31', 1)).toBe('2026-11-01')
  })

  it('crosses month and year boundaries', () => {
    expect(addDaysKey('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('treats the week as Monday-first', () => {
    // 2026-08-20 is a Thursday.
    expect(startOfWeekKey('2026-08-20')).toBe('2026-08-17')
    expect(endOfWeekKey('2026-08-20')).toBe('2026-08-23')
    // A Sunday belongs to the week that started the previous Monday.
    expect(startOfWeekKey('2026-08-23')).toBe('2026-08-17')
  })

  it('finds the last day of a month including a leap February', () => {
    expect(endOfMonthKey('2026-02-10')).toBe('2026-02-28')
    expect(endOfMonthKey('2028-02-10')).toBe('2028-02-29')
    expect(endOfMonthKey('2026-08-01')).toBe('2026-08-31')
  })
})

describe('dueState', () => {
  it('is none without a deadline', () => {
    expect(dueState(task({ due_date: null }))).toBe('none')
  })

  it('is none for finished work', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    expect(dueState(task({ due_date: past, status: 'done' }))).toBe('none')
  })

  it('is none for week and month commitments, which are not late until the period ends', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    expect(dueState(task({ due_date: past, horizon: 'week' }))).toBe('none')
    expect(dueState(task({ due_date: past, horizon: 'month' }))).toBe('none')
  })

  it('separates overdue from later-today', () => {
    const anHourAgo = new Date(Date.now() - 3_600_000).toISOString()
    expect(dueState(task({ due_date: anHourAgo }))).toBe('overdue')
  })

  it('calls a deadline later today "today", not "due soon"', () => {
    // Build 23:59 local on today's date; skip if the clock is already past it.
    const end = new Date()
    end.setHours(23, 59, 0, 0)
    if (end.getTime() > Date.now()) {
      expect(dueState(task({ due_date: end.toISOString() }))).toBe('today')
    }
  })

  it('calls tomorrow within 24 hours "due-soon"', () => {
    const soon = new Date(Date.now() + 20 * 3_600_000)
    // Only meaningful when that instant is genuinely a different calendar day.
    if (toDayKey(soon) !== toDayKey(new Date())) {
      expect(dueState(task({ due_date: soon.toISOString() }))).toBe('due-soon')
    }
  })

  it('calls anything further out "upcoming"', () => {
    const later = new Date(Date.now() + 5 * 86_400_000).toISOString()
    expect(dueState(task({ due_date: later }))).toBe('upcoming')
  })
})
