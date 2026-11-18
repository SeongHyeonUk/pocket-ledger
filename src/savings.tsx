import { RecordManager } from './record-manager'
import { useRecords } from './use-records'
import type { RecordOf } from './records'

export function Savings({ uid, goals, write, periodSavings, target }: {
  uid: string
  goals: { items: RecordOf<'savingsGoals'>[]; ready: boolean }
  write: (promise: Promise<void>) => void
  periodSavings: number | null
  target: number
}) {
  const transfers = useRecords(uid, 'transactions', undefined, true)
  const byGoal: Record<string, number> = Object.create(null)
  const byMonth = new Map<string, number>()
  let cumulative = 0
  for (const item of transfers.items) {
    if (item.goalId) byGoal[item.goalId] = (byGoal[item.goalId] ?? 0) + item.amount
    const month = item.date.slice(0, 7)
    byMonth.set(month, (byMonth.get(month) ?? 0) + item.amount)
    cumulative += item.amount
  }
  const money = (value: number | null) => value === null ? '—' : `${value.toLocaleString('ko-KR')}원`
  return <>
    <section className="card"><h2>이번 기간 저축</h2>
      <p>{money(periodSavings)} / {money(target)}</p>
      <p>누적 저축 {money(transfers.ready ? cumulative : null)}</p>
    </section>
    <RecordManager kind="savingsGoals" uid={uid} state={goals} write={write} savingsByGoal={transfers.ready ? byGoal : undefined} />
    <section className="card"><h2>월별 저축</h2>
      {!transfers.ready ? <p>저축 데이터를 확인 중입니다.</p> : byMonth.size === 0 ? <p>등록된 저축 이체가 없습니다.</p>
        : <ul className="record-list">{Array.from(byMonth).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12)
          .map(([month, amount]) => <li key={month}><span>{month}</span><strong>{money(amount)}</strong></li>)}</ul>}
    </section>
  </>
}
