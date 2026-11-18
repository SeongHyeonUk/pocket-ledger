import { useState, type FormEvent } from 'react'
import { seoulToday } from './budget'
import { schemas, type RecordOf } from './records'
import { deleteRecord, saveRecord } from './store'
import { editSchedule, nextOccurrence } from './subscriptions'

type Kind = 'subscriptions' | 'savingsGoals'
type Props = {
  uid: string
  kind: Kind
  state: { items: RecordOf<Kind>[]; ready: boolean }
  write: (promise: Promise<void>) => void
  savingsByGoal?: Record<string, number>
}
const cycles = { weekly: '매주', monthly: '매월', yearly: '매년' }
const format = (amount: number) => `${Math.round(amount).toLocaleString('ko-KR')}원`
const isSubscription = (value: RecordOf<Kind>): value is RecordOf<'subscriptions'> => 'cycle' in value

export function RecordManager({ uid, kind, state, write, savingsByGoal }: Props) {
  const [editor, setEditor] = useState<false | true | RecordOf<Kind>>(false)
  const [draftId, setDraftId] = useState('')
  const [problem, setProblem] = useState('')
  const subscription = kind === 'subscriptions'
  const record = editor && editor !== true ? editor : undefined
  const plan = record && isSubscription(record) ? record : undefined
  const label = subscription ? '구독' : '저축 목표'
  const yearly = state.items.reduce((sum, item) => {
    if (!isSubscription(item) || !item.active) return sum
    return sum + item.amount * ({ weekly: 52, monthly: 12, yearly: 1 }[item.cycle])
  }, 0)

  function open(next: true | RecordOf<Kind>) {
    setProblem('')
    setDraftId(next === true ? crypto.randomUUID() : next.id)
    setEditor(next)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get('amount'))
    const values = { name: form.get('name'), amount, memo: form.get('memo') }
    if (subscription) {
      const history = plan ? [...plan.priceHistory] : []
      if (!plan || plan.amount !== amount) history.push({ date: seoulToday(), amount })
      const parsed = schemas.subscriptions.safeParse({
        ...values, cycle: form.get('cycle'), nextDate: form.get('nextDate') || null,
        category: form.get('category'), active: form.has('active'), priceHistory: history.slice(-120),
      })
      if (!parsed.success) {
        setProblem('이름, 가격 및 결제일을 확인해 주세요.')
        return
      }
      const previous = plan?.scheduleHistory ?? []
      const changed = !plan || plan.active !== parsed.data.active || plan.cycle !== parsed.data.cycle
        || plan.nextDate !== parsed.data.nextDate || plan.amount !== parsed.data.amount
      const scheduleHistory = changed ? editSchedule(previous, parsed.data, seoulToday()) : previous
      if (scheduleHistory.length >= 120) {
        setProblem('변경 이력 한도에 도달했습니다. 기존 구독을 비활성화하고 새 구독을 추가해 주세요.')
        return
      }
      write(saveRecord(uid, 'subscriptions', { ...parsed.data, scheduleHistory }, draftId, plan?.version))
    } else {
      const result = schemas.savingsGoals.safeParse(values)
      if (!result.success) {
        setProblem('이름과 목표 금액을 확인해 주세요.')
        return
      }
      write(saveRecord(uid, 'savingsGoals', result.data, draftId, record?.version))
    }
    setEditor(false)
  }

  return <section className="card">
    <div className="row"><h2>{label} 목록</h2><button type="button" onClick={() => open(true)}>{label} 추가</button></div>
    {subscription && state.ready && <p>월평균 {format(yearly / 12)} · 연간 환산 {format(yearly)}</p>}
    {!state.ready ? <p>데이터를 확인 중입니다.</p> : state.items.length === 0 ? <p>등록된 {label} 항목이 없습니다.</p>
      : <ul className="record-list">{state.items.map(item => <li key={item.id}>
        <div><strong>{item.name}</strong>
          {isSubscription(item) && <small>{cycles[item.cycle]} · {item.active ? nextOccurrence(item, seoulToday()) || '결제일 미정' : '비활성'}</small>}
          {savingsByGoal && <small>누적 {format(savingsByGoal[item.id] ?? 0)} · {Math.round((savingsByGoal[item.id] ?? 0) / item.amount * 100)}%</small>}
          {isSubscription(item) && item.priceHistory.length > 0 && <details>
            <summary>가격 변경 이력</summary>
            {item.priceHistory.map(({ date, amount }, index) => <small key={index}>{date} · {format(amount)}</small>)}
          </details>}
        </div><strong>{format(item.amount)}</strong>
        <div className="actions">
          <button className="secondary" type="button" onClick={() => open(item)}>수정</button>
          <button className="secondary" type="button" onClick={() => {
            if (!window.confirm(`‘${item.name}’ 항목을 삭제할까요?`)) return
            const history = isSubscription(item) ? {
              scheduleHistory: editSchedule(item.scheduleHistory, { ...item, active: false }, seoulToday()),
            } : undefined
            write(deleteRecord(uid, kind, item.id, item.version, history))
          }}>삭제</button>
        </div>
      </li>)}</ul>}
    {editor && <div className="overlay"><dialog open className="editor" aria-labelledby="record-title">
      <form onSubmit={submit}>
        <div className="row"><h2 id="record-title">{label} {record ? '수정' : '추가'}</h2>
          <button type="button" className="secondary" onClick={() => setEditor(false)}>닫기</button></div>
        <div className="form-grid">
          <label>이름<input name="name" defaultValue={record?.name} maxLength={100} autoFocus required /></label>
          <label>{subscription ? '가격' : '목표 금액'} (원)<input name="amount" type="number" inputMode="numeric"
            min={1} max={1000000000} step={1} defaultValue={record?.amount} required /></label>
          {subscription && <>
            <label>결제 주기<select name="cycle" defaultValue={plan?.cycle ?? 'monthly'}>
              {Object.entries(cycles).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
            </select></label>
            <label>결제 기준일<input type="date" name="nextDate" defaultValue={plan?.nextDate ?? ''} /></label>
            <label>카테고리<input name="category" defaultValue={plan?.category ?? '구독료'} maxLength={100} required /></label>
            <label className="check"><input name="active" type="checkbox" defaultChecked={plan?.active ?? true} /> 활성</label>
          </>}
          <label className="wide">메모<textarea name="memo" maxLength={500} defaultValue={record?.memo} /></label>
        </div>
        {problem && <p className="error" role="alert">{problem}</p>}
        <button>저장</button>
      </form>
    </dialog></div>}
  </section>
}
