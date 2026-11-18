import { z } from 'zod'

const amount = z.number().int().min(1).max(1_000_000_000)
const title = z.string().trim().min(1, '이름을 입력해 주세요.').max(100)
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)
const memo = z.string().max(500)
const date = z.iso.date()
const budgetAmount = z.number().int().min(0).max(1_000_000_000)
const schedule = z.object({
  amount, cycle: z.enum(['weekly', 'monthly', 'yearly']), nextDate: date.nullable(), active: z.boolean(),
})

export const schemas = {
  transactions: z.object({
    name: title,
    type: z.enum(['expense', 'income', 'saving']),
    amount,
    date,
    category: title,
    bucket: z.enum(['transit', 'weekly', 'lottery', 'other']),
    included: z.boolean(),
    memo,
    payment: z.string().max(100),
    subscriptionId: id.or(z.literal('')),
    goalId: id.or(z.literal('')),
  }),
  subscriptions: schedule.extend({
    name: title, category: title, memo,
    priceHistory: z.array(z.object({ date, amount })).max(120),
    scheduleHistory: z.array(schedule.extend({ effective: date })).max(120).default([]),
  }),
  savingsGoals: z.object({ name: title, amount, memo }),
  settings: z.object({ balance: budgetAmount }),
  adjustments: z.object({
    amount: z.number().int().min(-1_000_000_000).max(1_000_000_000),
    reference: z.number().int().safe(),
  }),
  periods: z.object({
    effective: date,
    startDay: z.number().int().min(1).max(31),
    incomeDay: z.number().int().min(1).max(31),
    expectedIncome: budgetAmount, savings: budgetAmount, transit: budgetAmount,
    weekly: budgetAmount, lottery: budgetAmount,
    lotteryCycle: z.enum(['weekly', 'biweekly', 'monthly', 'disabled']),
    lotteryInWeekly: z.boolean(),
  }),
}

export type Collection = keyof typeof schemas
type ValuesByCollection = { [K in Collection]: z.infer<(typeof schemas)[K]> }
export type Values<K extends Collection> = ValuesByCollection[K]
type Metadata = {
  id: string
  uid: string
  version: number
  deleted: boolean
}
export type RecordOf<K extends Collection> = { [Name in Collection]: Values<Name> & Metadata }[K]
