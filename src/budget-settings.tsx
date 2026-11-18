import type { FormEvent } from 'react'
import { saveRecord } from './store'
import { schemas, type RecordOf } from './records'
import type { Budget } from './budget'

const fields = [
  ['startDay', '예산 시작일'], ['incomeDay', '월 용돈 입금 예정일'], ['expectedIncome', '예정 용돈 (원)'],
  ['savings', '기간 저축 목표 (원)'], ['transit', '교통비 예산 (원)'],
  ['weekly', '주간 자유 지출 (원)'], ['lottery', '복권 1회 예산 (원)'],
] as const

export function BudgetSettings({ uid, current, effective, scheduled, write }: {
  uid: string
  current: Budget
  effective: string
  scheduled?: RecordOf<'periods'>
  write: (promise: Promise<void>) => void
}) {
  const settings = scheduled ?? current
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = schemas.periods.parse({
      ...Object.fromEntries(fields.map(([key]) => [key, Number(form.get(key))])),
      effective,
      lotteryCycle: form.get('lotteryCycle'),
      lotteryInWeekly: form.has('lotteryInWeekly'),
    })
    write(saveRecord(uid, 'periods', values, effective, scheduled?.version))
  }
  return <section className="card">
    <h2>예산 설정</h2>
    <p>{effective}부터 이 예산이 적용됩니다.</p>
    <form onSubmit={submit} key={scheduled?.version ?? 0}>
      <div className="form-grid">
        {fields.map(([key, label]) => <label key={key}>{label}<input required type="number" inputMode="numeric"
          name={key} min={key.endsWith('Day') ? 1 : 0} max={key.endsWith('Day') ? 31 : 1000000000}
          step={1} defaultValue={settings[key]} /></label>)}
        <label>복권 구매 주기<select defaultValue={settings.lotteryCycle} name="lotteryCycle">
          <option value="weekly">매주</option><option value="biweekly">격주</option>
          <option value="monthly">매월</option><option value="disabled">사용 안 함</option>
        </select></label>
        <label className="check"><input type="checkbox" name="lotteryInWeekly" defaultChecked={settings.lotteryInWeekly} /> 복권을 자유 지출에 포함</label>
      </div>
      <button className="spaced">예산 설정 저장</button>
    </form>
  </section>
}
