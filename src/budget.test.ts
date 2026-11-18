import assert from 'node:assert/strict'
import { test } from 'vitest'
import { adjustedAmount, budgetPeriod, budgetTotals, defaultBudget, initialSubscriptions, mondayWeek, resolveBudget, seoulToday } from './budget.ts'
import { nextOccurrence, plannedSubscription } from './subscriptions.ts'

test('일요일까지 같은 주를 사용하고 월요일에 새 주로 전환한다', () => {
  assert.deepEqual(mondayWeek('2027-01-03'), { start: '2026-12-28', end: '2027-01-03' })
  assert.deepEqual(mondayWeek('2027-01-04'), { start: '2027-01-04', end: '2027-01-10' })
})

test('수정 후에도 새 수입은 더하고 지출은 차감한다', () => {
  const adjustment = { amount: 30000, reference: 100000 }
  assert.equal(adjustedAmount(100000, adjustment), 30000)
  assert.equal(adjustedAmount(125000, adjustment), 55000)
  assert.equal(adjustedAmount(95000, adjustment), 25000)
  assert.equal(adjustedAmount(30000), 30000)
})

test('10일 전후, 연도 변경, 서울 자정', () => {
  assert.equal(seoulToday(new Date('2026-12-31T15:00:00Z')), '2027-01-01')
  assert.equal(budgetPeriod('2026-12-09', 10).start, '2026-11-10')
  assert.equal(budgetPeriod('2026-12-10', 10).end, '2027-01-09')
  assert.equal(budgetPeriod('2026-12-10', 10, 1).start, '2027-01-10')
})

test('31일 시작일의 윤년 보정과 짧은 마지막 주', () => {
  const period = budgetPeriod('2024-02-29', 31)
  assert.equal(period.start, '2024-02-29')
  assert.equal(period.end, '2024-03-30')
  assert.deepEqual(period.weeks.at(-1), { start: '2024-03-28', end: '2024-03-30' })
  assert.equal(budgetPeriod('2025-02-28', 31).start, '2025-02-28')
  assert.equal(budgetPeriod('2025-02-10', 10).weeks.length, 4)
  assert.throws(() => budgetPeriod('2025-02-29', 10), RangeError)
})

test('변경된 시작일과 예산은 적용일 이후에만 사용한다', () => {
  const revisions = [{ ...defaultBudget, effective: '2026-12-10', startDay: 15, weekly: 20000 }]
  const previous = resolveBudget('2026-12-09', revisions)
  const transition = resolveBudget('2026-12-10', revisions)
  assert.equal(previous.settings.weekly, 30000)
  assert.equal(previous.period.end, '2026-12-09')
  assert.equal(transition.settings.weekly, 20000)
  assert.equal(transition.period.start, '2026-12-10')
  assert.equal(transition.period.end, '2026-12-14')
  assert.equal(resolveBudget('2026-12-15', revisions).period.start, '2026-12-15')
})

test('알려진 결제일 기준으로 월말·윤년·주간 구독료를 계산한다', () => {
  const monthly = { active: true, amount: 4400, cycle: 'monthly' as const, nextDate: '2024-01-31' }
  assert.equal(nextOccurrence(monthly, '2024-02-01'), '2024-02-29')
  assert.equal(nextOccurrence(monthly, '2024-03-01'), '2024-03-31')
  assert.equal(plannedSubscription(monthly, '2024-02-10', '2024-03-09'), 4400)
  assert.equal(plannedSubscription({ ...monthly, cycle: 'weekly' }, '2024-02-01', '2024-02-29'), 17600)
})

test('구독 결제와 저축 이체를 한 번만 배정하고 복권 분류를 적용', () => {
  assert.equal(initialSubscriptions.reduce((total, item) => total + item.amount, 0), 67_190)
  const planned = [{ id: 'a', amount: 4400 }]
  const results = budgetTotals({ ...defaultBudget, lotteryInWeekly: true }, 5, [
    { type: 'income', amount: 450_000, bucket: 'other', included: false },
    { type: 'expense', amount: 4400, bucket: 'weekly', included: true, occurrenceId: 'a' },
    { type: 'expense', amount: 5000, bucket: 'lottery', included: true },
    { type: 'saving', amount: 50_000, bucket: 'other', included: true },
  ], planned)
  assert.equal(results.allocated, 274_400)
  assert.equal(results.expenses, 9400)
  assert.equal(results.cash, 390_600)
  assert.equal(results.spent.weekly, 5000)
  assert.equal(results.spent.subscriptions, 4400)
  assert.equal(results.spent.lottery, 0)
  assert.equal(results.actualSurplus, results.expectedSurplus)
})
