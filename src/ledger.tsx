import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import { Activity, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, LayoutDashboard, List, Plus, Settings, Wallet } from 'lucide-react'
import { budgetTotals, initialSubscriptions, resolveBudget, seoulToday, shiftDate } from './budget'
import { trustedDevice } from './database'
import { deleteRecord, mergeBackup, saveRecord } from './store'
import { TransactionForm, transactionTypes } from './transaction-form'
import { useRecords } from './use-records'
import { RecordManager } from './record-manager'
import { BudgetSettings } from './budget-settings'
import { Backup } from './backup'
import { editSchedule, historicalSubscription, nextOccurrence } from './subscriptions'
import { Savings } from './savings'
import type { RecordOf } from './records'

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`
const Charts = lazy(() => import('./charts').then(module => ({ default: module.Charts })))
const pages = [
  ['/', '대시보드', LayoutDashboard],
  ['/transactions', '거래', List],
  ['/subscriptions', '구독', CalendarDays],
  ['/savings', '저축', CircleDollarSign],
  ['/statistics', '통계', Activity],
  ['/settings', '설정', Settings],
] as const

export default function Ledger({ uid, logout }: { uid: string; logout: () => void }) {
  const today = seoulToday()
  const [selected, setSelected] = useState<string>()
  const revisions = useRecords(uid, 'periods')
  const { period, settings } = resolveBudget(selected ?? today, revisions.items)
  const currentBudget = resolveBudget(today, revisions.items)
  const nextBudgetDate = shiftDate(currentBudget.period.end, 1)
  const transactions = useRecords(uid, 'transactions', period)
  const subscriptions = useRecords(uid, 'subscriptions')
  const goals = useRecords(uid, 'savingsGoals')
  const balances = useRecords(uid, 'settings')
  const balance = balances.items.find(item => item.id === 'main')
  const [balanceDraft, setBalanceDraft] = useState<string | null>(null)
  const [editor, setEditor] = useState<false | 'income' | 'expense' | RecordOf<'transactions'>>(false)
  const [showIncome, setShowIncome] = useState(false)
  const [writes, setWrites] = useState(0)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [category, setCategory] = useState('')
  const states = [transactions, subscriptions, goals, revisions]
  const ready = states.every(state => state.ready)
  const pending = writes > 0 || balances.pending || states.some(state => state.pending)
  const cached = balances.cached || states.some(state => state.cached)
  const readError = balances.error || states.some(state => state.error)
  const status = readError || error ? '동기화 오류' : pending ? '서버 반영 대기'
    : cached ? '오프라인 또는 연결 중' : '동기화 완료'

  function write(promise: Promise<void>) {
    setError('')
    setWrites(count => count + 1)
    return promise.then(() => true, () => {
      setError('서버가 변경을 받지 못했습니다. 권한 또는 다른 기기의 변경 사항을 확인한 뒤 다시 시도해 주세요.')
      return false
    }).finally(() => setWrites(count => count - 1))
  }

  useEffect(() => {
    if (!pending && !editor && balanceDraft === null) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending, editor, balanceDraft])

  const planned = subscriptions.items.flatMap(item => {
    const amount = historicalSubscription(item, period.start, period.end)
    return amount ? [{ id: item.id, amount }] : []
  })
  const liveSubscriptions = subscriptions.items.filter(item => !item.deleted)
  const subscriptionsEmpty = subscriptions.ready && !subscriptions.cached && subscriptions.items.length === 0
  useEffect(() => {
    if (!subscriptionsEmpty) return
    const seed = initialSubscriptions.map(item => ({
      collection: 'subscriptions' as const, id: item.id, deleted: false,
      values: { ...item, category: '구독료', memo: '', priceHistory: [],
        scheduleHistory: editSchedule([], item, today) },
    }))
    void mergeBackup(uid, seed).catch(() => setError('기본 구독 설정을 저장하지 못했습니다. 연결 후 다시 접속해 주세요.'))
  }, [subscriptionsEmpty, today, uid])
  const budget = budgetTotals(settings, period.weeks.length,
    transactions.items.map(item => ({ ...item, occurrenceId: item.subscriptionId })), planned)
  const week = period.weeks.find(item => item.start <= today && item.end >= today)
  const weekSpent = transactions.items.filter(item => week && item.date >= week.start && item.date <= week.end
    && item.type === 'expense' && (item.bucket === 'weekly' || (item.bucket === 'lottery' && settings.lotteryInWeekly))
    && item.included && !planned.some(plan => plan.id === item.subscriptionId))
    .reduce((sum, item) => sum + item.amount, 0)
  const weekLeft = week ? settings.weekly - weekSpent : null
  const incomeDate = nextOccurrence({ active: true, amount: settings.expectedIncome, cycle: 'monthly',
    nextDate: `2000-01-${String(settings.incomeDay).padStart(2, '0')}` }, period.start)
  const filtered = transactions.items.filter(item => (!type || item.type === type) && (!category || item.category === category)
    && [item.name, item.memo, item.category, item.payment].some(value => value.toLowerCase().includes(search.trim().toLowerCase())))
  const categories = useMemo(() => [...new Set(transactions.items.map(item => item.category))].sort(), [transactions.items])
  const title = (name: string) => <h1>{name}</h1>
  const charts = (detailed = false) => ready && <Suspense fallback={<p role="status">차트를 여는 중입니다.</p>}>
    <Charts uid={uid} period={period} transactions={transactions.items} subscriptions={subscriptions.items}
      revisions={revisions.items} budget={budget} detailed={detailed} />
  </Suspense>

  function transactionList(items: RecordOf<'transactions'>[], controls = false) {
    if (!transactions.ready) return <p>{transactions.error ? '거래를 불러올 수 없습니다.' : '이 기간의 서버 데이터 또는 오프라인 저장본을 확인 중입니다.'}</p>
    if (!items.length) return <p>표시할 거래가 없습니다.</p>
    return <ul className="record-list">{items.map(item => <li key={item.id}>
      <div><strong>{item.name}</strong><small>{item.date} · {item.category} · {transactionTypes[item.type]}</small></div>
      <strong>{item.type === 'income' ? '+' : '−'}{money(item.amount)}</strong>
      {controls && <div className="actions">
        <button className="secondary" type="button" onClick={() => setEditor(item)}>수정</button>
        <button className="secondary" type="button" onClick={() => {
          if (window.confirm(`‘${item.name}’ 거래를 삭제할까요?`)) write(deleteRecord(uid, 'transactions', item.id, item.version))
        }}>삭제</button>
      </div>}
    </li>)}</ul>
  }

  const kpis = [
    ['예정 수입', money(budget.expectedIncome)], ['실제 수입', money(budget.income)],
    ['실제 소비', money(budget.expenses)], ['남은 예산', money(budget.remaining)],
    ['이번 주 남은 금액', weekLeft === null ? '—' : money(weekLeft)],
    ['저축 목표 달성률', budget.savingsTarget ? `${Math.round(budget.savings / budget.savingsTarget * 100)}%` : '—'],
    ['가용 현금', money(budget.cash)], ['예상 여윳돈', money(budget.expectedSurplus)],
    ['예정 고정 지출', money(budget.plannedFixed)], ['예산 배정액', money(budget.allocated)],
    ['실제 잔여액', money(budget.actualSurplus)], ['실제 저축액', money(budget.savings)],
  ]
  return <div className="ledger" data-pending={pending || balanceDraft !== null}>
    <aside className="sidebar"><div className="brand"><Wallet size={22} /> Pocket Ledger</div>
      <nav aria-label="가계부 메뉴">{pages.map(([path, label, Icon]) =>
        <NavLink to={path} key={path} end={path === '/'}><Icon size={19} />{label}</NavLink>)}</nav>
      <button type="button" className="secondary desktop-logout" onClick={logout} disabled={pending}>로그아웃</button>
    </aside>
    <main className="content">
      <header className="toolbar">
        <div className="period">
          <button className="icon-button secondary" aria-label="이전 기간" onClick={() => setSelected(shiftDate(period.start, -1))}><ChevronLeft size={19} /></button>
          <button className="secondary" title="현재 기간으로 이동" onClick={() => setSelected(undefined)}>{period.start} ~ {period.end}</button>
          <button className="icon-button secondary" aria-label="다음 기간" onClick={() => setSelected(shiftDate(period.end, 1))}><ChevronRight size={19} /></button>
        </div>
        <span className="sync" role="status">{status}</span>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {readError && <p className="error" role="alert">Firestore 접근 권한을 확인해 주세요. 서버 데이터의 상태를 확인할 수 없습니다.</p>}
      <Routes>
        <Route path="/" element={<>
          <div className="row heading">{title('대시보드')}<button onClick={() => setEditor('expense')}><Plus size={18} /> 빠른 지출 등록</button></div>
          {period.start <= today && today <= period.end && <p className="period-days">종료일까지 {Math.round((Date.parse(period.end) - Date.parse(today)) / 86_400_000)}일</p>}
          <section className="kpis" aria-label="기간 요약">{kpis.map(([label, value], index) => <article key={label} className={index === 3 ? 'card primary-card' : 'card'}>
            <span>{label}</span><strong>{ready ? value : '—'}</strong>
            {index === 0 && incomeDate && incomeDate <= period.end && <small>{incomeDate} 입금 예정</small>}
            {label === '실제 수입' && <div className="actions">
              <button className="secondary" type="button" onClick={() => setEditor('income')}>수입 추가</button>
              <button className="secondary" type="button" aria-expanded={showIncome} onClick={() => setShowIncome(!showIncome)}>수입 내역 수정</button>
            </div>}
          </article>)}</section>
          {showIncome && <section className="card"><h2>이번 선택 기간의 수입 내역</h2>
            {transactionList(transactions.items.filter(item => item.type === 'income'), true)}
          </section>}
          <section className="card"><h2>현재 보유 총액</h2>
            <p>직접 확인한 금액을 기록하세요. 수입·지출 통계에는 반영되지 않습니다.</p>
            <form className="actions spaced" onSubmit={async event => {
              event.preventDefault()
              if (balanceDraft === null || balanceDraft.trim() === '' || pending) return
              const ok = await write(saveRecord(uid, 'settings', { balance: Number(balanceDraft) }, 'main', balance?.version))
              if (ok) setBalanceDraft(null)
            }}>
              <input aria-label="현재 보유 총액 (원)" type="number" inputMode="numeric" min={0} max={1000000000}
                step={1} required disabled={!balances.ready || pending} placeholder="금액 (원)"
                value={balanceDraft ?? balance?.balance ?? ''} onChange={event => setBalanceDraft(event.target.value)} />
              <button type="submit" disabled={!balances.ready || pending || balanceDraft === null}>총액 저장</button>
            </form>
            {balance && <p>저장된 총액 <strong>{money(balance.balance)}</strong></p>}
          </section>
          {ready && (budget.remaining < 0 || (weekLeft !== null && weekLeft < 0)) && <p className="error">예산을 초과했습니다.</p>}
          <section className="card"><h2>최근 거래</h2>{transactionList(transactions.items.slice(0, 6))}</section>
          <section className="card"><h2>예정 구독</h2>{subscriptions.ready && <ul className="record-list">{liveSubscriptions.filter(item => item.active).map(item => <li key={item.id}>
            <div><strong>{item.name}</strong><small>{nextOccurrence(item, today) || '결제일 미정'}</small></div><strong>{money(item.amount)}</strong>
          </li>)}</ul>}</section>
          {charts()}
        </>} />
        <Route path="/transactions" element={<>
          <div className="row heading">{title('거래')}<button onClick={() => setEditor('expense')}><Plus size={18} /> 거래 추가</button></div>
          <section className="card">
            <div className="filters">
              <input aria-label="거래 검색" value={search} onChange={event => setSearch(event.target.value)} placeholder="거래명 · 메모 검색" />
              <select aria-label="거래 유형" value={type} onChange={event => setType(event.target.value)}><option value="">모든 유형</option>
                {Object.entries(transactionTypes).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>
              <select aria-label="카테고리" value={category} onChange={event => setCategory(event.target.value)}><option value="">모든 카테고리</option>
                {categories.map(item => <option key={item}>{item}</option>)}</select>
            </div>{transactionList(filtered, true)}
          </section>
        </>} />
        <Route path="/subscriptions" element={<>
          {title('구독')}
          <RecordManager kind="subscriptions" uid={uid} state={{ ...subscriptions, items: liveSubscriptions }} write={write} />
        </>} />
        <Route path="/savings" element={<>
          {title('저축')}
          <Savings uid={uid} goals={goals} write={write} periodSavings={ready ? budget.savings : null} target={budget.savingsTarget} />
        </>} />
        <Route path="/statistics" element={<>
          {title('통계')}
          {charts(true)}
        </>} />
        <Route path="/settings" element={<>
          {title('설정')}
          {revisions.ready && <BudgetSettings uid={uid} current={currentBudget.settings} effective={nextBudgetDate}
            scheduled={revisions.items.find(item => item.effective === nextBudgetDate)} write={write} />}
          <Backup uid={uid} disabled={pending || cached || Boolean(readError)} />
          <section className="card"><h2>오프라인 저장</h2>
            <p>{trustedDevice ? '이 브라우저에 가계부 데이터가 저장됩니다. 개인 기기에서 사용하세요.' : '이 브라우저에 가계부 데이터를 지속적으로 저장하지 않습니다.'}</p>
            <button type="button" disabled={pending || !!editor} onClick={() => {
              if (trustedDevice || window.confirm('개인 기기에서만 오프라인 저장을 켜세요. 브라우저에 가계부 기록이 남습니다.')) {
                localStorage.setItem('ledger-trusted-device', String(!trustedDevice))
                window.location.reload()
              }
            }}>{trustedDevice ? '오프라인 저장 끄기' : '개인 기기에 오프라인 저장 켜기'}</button>
          </section>
          <section className="card"><button className="secondary" disabled={pending} onClick={logout}>로그아웃</button></section>
        </>} />
        <Route path="*" element={<section className="card"><h1>페이지를 찾을 수 없습니다</h1><NavLink to="/">대시보드로 돌아가기</NavLink></section>} />
      </Routes>
    </main>
    {editor && <div className="overlay">
      <TransactionForm uid={uid} record={typeof editor === 'object' ? editor : undefined}
        initialType={typeof editor === 'string' ? editor : undefined}
        initialDate={today >= period.start && today <= period.end ? today : period.start} subscriptions={liveSubscriptions}
        goals={goals.items} close={() => setEditor(current => current === editor ? false : current)} write={write} />
    </div>}
  </div>
}
