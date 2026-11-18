import { shiftDate } from './budget'
import type { Values } from './records'

type Schedule = Pick<Values<'subscriptions'>, 'nextDate' | 'cycle' | 'amount' | 'active'>

export function editSchedule(history: Values<'subscriptions'>['scheduleHistory'], schedule: Schedule, effective: string) {
  return [...history.filter(item => item.effective !== effective), {
    amount: schedule.amount, nextDate: schedule.nextDate, active: schedule.active, cycle: schedule.cycle, effective,
  }].sort((a, b) => a.effective.localeCompare(b.effective))
}

export function nextOccurrence(schedule: Schedule, from: string): string | null {
  const anchor = schedule.nextDate
  if (!schedule.active || !anchor) return null
  if (from <= anchor) return anchor
  if (schedule.cycle === 'weekly') {
    const elapsed = (Date.parse(from) - Date.parse(anchor)) / 86_400_000
    return shiftDate(anchor, Math.ceil(elapsed / 7) * 7)
  }
  const first = new Date(anchor + 'T00:00:00Z')
  const date = new Date(from + 'T00:00:00Z')
  const elapsed = (date.getUTCFullYear() - first.getUTCFullYear()) * 12 + date.getUTCMonth() - first.getUTCMonth()
  const interval = schedule.cycle === 'yearly' ? 12 : 1
  const boundary = (offset: number) => {
    const next = new Date(first)
    next.setUTCMonth(first.getUTCMonth() + offset + 1, 0)
    next.setUTCDate(Math.min(first.getUTCDate(), next.getUTCDate()))
    return next.toISOString().slice(0, 10)
  }
  const offset = Math.max(0, Math.floor(elapsed / interval)) * interval
  const candidate = boundary(offset)
  return candidate >= from ? candidate : boundary(offset + interval)
}

export function plannedSubscription(schedule: Schedule, start: string, end: string) {
  if (!schedule.active) return 0
  if (!schedule.nextDate) return schedule.cycle === 'monthly' ? schedule.amount : 0
  let total = 0
  let date = nextOccurrence(schedule, start)
  while (date && date <= end) {
    total += schedule.amount
    date = nextOccurrence(schedule, shiftDate(date, 1))
  }
  return total
}

export function historicalSubscription(subscription: Values<'subscriptions'>, start: string, end: string) {
  const history = subscription.scheduleHistory
  if (!history.length) return plannedSubscription(subscription, start, end)
  const revision = history.slice().reverse().find(item => item.effective <= end)
  if (!revision) return 0
  if (!revision.nextDate && revision.active && revision.cycle === 'monthly') return revision.amount
  return history.reduce((total, schedule, index) => {
    const next = history[index + 1]
    const from = schedule.effective > start ? schedule.effective : start
    const to = next && next.effective <= end ? shiftDate(next.effective, -1) : end
    return total + (from <= to && schedule.nextDate ? plannedSubscription(schedule, from, to) : 0)
  }, 0)
}
