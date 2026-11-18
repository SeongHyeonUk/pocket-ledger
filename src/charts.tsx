import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { budgetTotals, resolveBudget, seoulToday, shiftDate } from './budget'
import { historicalSubscription } from './subscriptions'
import { useRecords } from './use-records'
import type { RecordOf } from './records'

const colors = ['#267551', '#4e67c6', '#ae692b', '#9662ab', '#227d86', '#a84657']
const money = (value: number) => `${value.toLocaleString('ko-KR')}원`
const ratio = (part: number, total: number) => total > 0 ? `${Math.round(100 * part / total)}%` : '—'
const tooltip = (value: unknown) => typeof value === 'number' ? money(value) : String(value)

export function Charts({ uid, period, transactions, subscriptions, revisions, budget, detailed = false }: {
  uid: string
  period: ReturnType<typeof resolveBudget>['period']
  transactions: RecordOf<'transactions'>[]
  subscriptions: RecordOf<'subscriptions'>[]
  revisions: RecordOf<'periods'>[]
  budget: ReturnType<typeof budgetTotals>
  detailed?: boolean
}) {
  const today = seoulToday()
  const year = (period.start <= today && today <= period.end ? today : period.start).slice(0, 4)
  const historyStart = `${Number(year) - 1}-06-01`
  const historyEnd = `${Number(year) + 1}-01-31`
  const history = useRecords(uid, 'transactions', { start: historyStart, end: historyEnd })
  const expenses = transactions.filter(item => item.type === 'expense')
  const sum = (items: typeof transactions) => items.reduce((total, item) => total + item.amount, 0)
  const grouped = new Map<string, number>()
  for (const item of expenses) grouped.set(item.category, (grouped.get(item.category) ?? 0) + item.amount)
  const categories = Array.from(grouped, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const between = (items: typeof transactions, start: string, end: string) => items.filter(item => start <= item.date && item.date <= end)
  const days = []
  for (let date = period.start; date <= period.end; date = shiftDate(date, 1)) {
    days.push({ name: date.slice(5), 소비: sum(between(expenses, date, date)) })
  }
  const weeks = period.weeks.map(({ start, end }, index) => ({ name: `${index + 1}주`, 소비: sum(between(expenses, start, end)) }))
  const allocations = [['교통비', 'transit'], ['자유 지출', 'weekly'], ['구독료', 'subscriptions'], ['복권', 'lottery']]
    .map(([name, key]) => {
      const bucket = key as keyof typeof budget.allocations
      return { name, 배정: budget.allocations[bucket], 소비: budget.spent[bucket] }
    })
  const prior = resolveBudget(shiftDate(period.start, -1), revisions).period
  const priorSpend = sum(between(history.items, prior.start, prior.end).filter(item => item.type === 'expense'))
  const annualTotal = (kind: 'income' | 'expense') => sum(history.items.filter(item => item.date.startsWith(year) && item.type === kind))
  const recent = []
  let cursor = period.start
  for (let index = 0; index < 6; index++) {
    const { settings, period: { start, end, weeks } } = resolveBudget(cursor, revisions)
    if (start >= historyStart && end <= historyEnd) {
      const stats = budgetTotals(settings, weeks.length, between(history.items, start, end)
        .map(item => ({ ...item, occurrenceId: item.subscriptionId })), subscriptions.map(item => ({
        id: item.id, amount: historicalSubscription(item, start, end),
      })).filter(item => item.amount > 0))
      recent.unshift({ name: start.slice(5), 여윳돈: stats.actualSurplus, 저축: stats.savings, 목표: stats.savingsTarget, completed: end < today })
    }
    cursor = shiftDate(start, -1)
  }
  const completed = recent.filter(item => item.completed)
  const average = completed.length ? Math.round(completed.reduce((total, item) => total + item.여윳돈, 0) / completed.length) : null
  const metrics = [
    ['기간 실제 수입', money(budget.income)], ['기간 실제 소비', money(budget.expenses)],
    ['예산 대비 소비율', ratio(budget.expenses, budget.allocated - budget.savingsTarget)],
    ['저축률', ratio(budget.savings, budget.income)],
    ['구독료 비중', ratio(sum(expenses.filter(item => !!item.subscriptionId)), budget.expenses)],
    ['교통비 사용률', ratio(budget.spent.transit, budget.allocations.transit)],
    ['이전 기간 대비 소비 증감', history.ready ? money(budget.expenses - priorSpend) : '—'],
    ['최근 완료 기간 평균 여윳돈', history.ready && average !== null ? money(average) : '—'],
    [`${year}년 유입`, history.ready ? money(annualTotal('income')) : '—'],
    [`${year}년 소비`, history.ready ? money(annualTotal('expense')) : '—'],
  ]
  const line = (label: string, data: object[], key: string) => <section className="card" key={label}><h2>{label}</h2>
    <div className="chart"><ResponsiveContainer><LineChart data={data}><XAxis dataKey="name" minTickGap={20} />
      <YAxis width={48} /><Tooltip formatter={tooltip} /><Line dataKey={key} stroke={colors[0]} strokeWidth={3} dot={false} />
    </LineChart></ResponsiveContainer></div></section>
  const bars = (label: string, data: object[], keys: string[]) => <section className="card" key={label}><h2>{label}</h2>
    <div className="chart"><ResponsiveContainer><BarChart data={data}><XAxis dataKey="name" /><YAxis width={48} />
      <Tooltip formatter={tooltip} />{keys.length > 1 && <Legend />}{keys.map((key, index) => <Bar key={key} dataKey={key} fill={colors[index]} />)}
    </BarChart></ResponsiveContainer></div></section>
  return <>
    {detailed && <section className="card"><h2>기간별 지표</h2><dl className="metric-list">
      {metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>}
    <div className="chart-grid">
      <section className="card"><h2>카테고리별 소비</h2>
        {categories.length ? <div className="chart" role="img" aria-label={categories.map(item => `${item.name} ${money(item.value)}`).join(', ')}>
          <ResponsiveContainer><PieChart><Tooltip formatter={tooltip} /><Legend />
            <Pie data={categories} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="76%">
              {categories.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
            </Pie></PieChart></ResponsiveContainer></div> : <p>이 기간에 확정된 소비가 없습니다.</p>}
      </section>
      {line('날짜별 소비', days, '소비')}
      {bars('배정 예산과 실제 소비', allocations, ['배정', '소비'])}
      {bars('주간 소비', weeks, ['소비'])}
      {history.ready ? line('최근 기간 실제 여윳돈', recent, '여윳돈') : <p>최근 기간 데이터를 확인 중입니다.</p>}
      {history.ready && bars('최근 기간 저축', recent, ['목표', '저축'])}
    </div>
  </>
}
