export const defaultBudget = {
  startDay: 10,
  incomeDay: 10,
  expectedIncome: 450_000,
  savings: 50_000,
  transit: 70_000,
  weekly: 30_000,
  lottery: 5_000,
  lotteryCycle: 'monthly' as 'weekly' | 'biweekly' | 'monthly' | 'disabled',
  lotteryInWeekly: false,
}

export const initialSubscriptions = [4400, 9900, 14900, 990, 8000, 29000].map((amount, index) => ({
  id: `initial-${index + 1}`,
  name: `구독 ${'ABCDEF'[index]}`,
  amount,
  cycle: 'monthly' as const,
  nextDate: null,
  active: true,
}))

export function seoulToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-')
}

const dateOnly = (date: Date) => date.toISOString().slice(0, 10)
const dayMs = 86_400_000

export function budgetPeriod(date: string, startDay: number, offset = 0) {
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 31) {
    throw new RangeError('예산 시작일은 1일부터 31일까지입니다.')
  }
  const current = new Date(date + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+current) || dateOnly(current) !== date) {
    throw new RangeError('유효한 날짜를 입력해 주세요.')
  }
  const boundary = (monthOffset: number) => {
    const result = new Date(current)
    result.setUTCMonth(current.getUTCMonth() + monthOffset + 1, 0)
    result.setUTCDate(Math.min(startDay, result.getUTCDate()))
    return +result
  }
  const index = (+current < boundary(0) ? -1 : 0) + offset
  const start = boundary(index)
  const next = boundary(index + 1)
  return periodBetween(dateOnly(new Date(start)), dateOnly(new Date(next - dayMs)))
}

export function shiftDate(date: string, days: number) {
  return dateOnly(new Date(Date.parse(date + 'T00:00:00Z') + days * dayMs))
}

export function mondayWeek(date: string) {
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay()
  const start = shiftDate(date, -((weekday + 6) % 7))
  return { start, end: shiftDate(start, 6) }
}

export function adjustedAmount(calculated: number, adjustment?: { amount: number; reference: number }) {
  return adjustment ? adjustment.amount + calculated - adjustment.reference : calculated
}

function periodBetween(startDate: string, endDate: string) {
  const start = Date.parse(startDate + 'T00:00:00Z')
  const next = Date.parse(endDate + 'T00:00:00Z') + dayMs
  const weeks = []
  for (let cursor = start; cursor < next; cursor += 7 * dayMs) {
    weeks.push({
      start: dateOnly(new Date(cursor)),
      end: dateOnly(new Date(Math.min(cursor + 7 * dayMs, next) - dayMs)),
    })
  }
  return { start: startDate, end: endDate, weeks }
}

export type Budget = typeof defaultBudget
export type BudgetRevision = Budget & { effective: string }

export function resolveBudget(date: string, revisions: BudgetRevision[]) {
  const ordered = revisions.slice().sort((a, b) => a.effective.localeCompare(b.effective))
  const nextIndex = ordered.findIndex(revision => revision.effective > date)
  const index = (nextIndex === -1 ? ordered.length : nextIndex) - 1
  const active = ordered[index]
  const settings = active ?? defaultBudget
  const normal = budgetPeriod(date, settings.startDay)
  const start = active && active.effective > normal.start ? active.effective : normal.start
  const next = ordered[index + 1]
  const end = next && next.effective <= normal.end ? shiftDate(next.effective, -1) : normal.end
  return { settings, period: periodBetween(start, end) }
}
type ExpenseBucket = 'transit' | 'weekly' | 'lottery' | 'other'
type Entry = {
  type: 'income' | 'expense' | 'saving'
  amount: number
  bucket: ExpenseBucket
  included: boolean
  occurrenceId?: string
}
type SubscriptionOccurrence = { id: string; amount: number }

export function budgetTotals(budget: Budget, weekCount: number, entries: Entry[], planned: SubscriptionOccurrence[]) {
  const subscriptionBudget = planned.reduce((total, item) => total + item.amount, 0)
  const occurrences = new Set(planned.map(item => item.id))
  const lotteryCount = { weekly: weekCount, biweekly: Math.ceil(weekCount / 2), monthly: 1, disabled: 0 }
  const lotteryBudget = budget.lotteryInWeekly ? 0 : budget.lottery * lotteryCount[budget.lotteryCycle]
  const allocations = {
    transit: budget.transit,
    weekly: budget.weekly * weekCount,
    lottery: lotteryBudget,
    other: 0,
    subscriptions: subscriptionBudget,
    savings: budget.savings,
  }
  const spent = { transit: 0, weekly: 0, lottery: 0, other: 0, subscriptions: 0, savings: 0 }
  let income = 0
  let expenses = 0
  let savings = 0
  for (const entry of entries) {
    if (entry.type === 'income') income += entry.amount
    if (entry.type === 'saving') {
      savings += entry.amount
      if (entry.included) spent.savings += entry.amount
    }
    if (entry.type === 'expense') {
      expenses += entry.amount
      if (!entry.included) continue
      const bucket = entry.occurrenceId && occurrences.has(entry.occurrenceId)
        ? 'subscriptions'
        : entry.bucket === 'lottery' && budget.lotteryInWeekly ? 'weekly' : entry.bucket
      spent[bucket] += entry.amount
    }
  }
  const allocated = Object.values(allocations).reduce((total, amount) => total + amount, 0)
  const remaining = Object.values(spent).reduce((total, amount) => total - amount, allocated)
  const reserved = Object.entries(allocations).reduce((total, [bucket, amount]) =>
    total + Math.max(0, amount - spent[bucket as keyof typeof spent]), 0)
  const cash = income - expenses - savings
  return {
    expectedIncome: budget.expectedIncome,
    plannedFixed: subscriptionBudget + lotteryBudget,
    income, expenses, savings, allocated, remaining, cash,
    savingsTarget: budget.savings,
    expectedSurplus: budget.expectedIncome - allocated,
    actualSurplus: cash - reserved,
    allocations, spent,
  }
}
