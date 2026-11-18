import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { seoulToday } from './budget'
import { schemas, type RecordOf, type Values } from './records'
import { saveRecord } from './store'

export const transactionTypes = { expense: '지출', income: '수입', saving: '저축 이체' }
export const buckets = { weekly: '자유 지출', transit: '교통비', lottery: '복권', other: '기타' }

type Props = {
  uid: string
  record?: RecordOf<'transactions'>
  initialType?: Values<'transactions'>['type']
  initialDate?: string
  subscriptions: RecordOf<'subscriptions'>[]
  goals: RecordOf<'savingsGoals'>[]
  close: () => void
  write: (promise: Promise<void>) => Promise<boolean>
}

export function TransactionForm({ uid, record, initialType = 'expense', initialDate = seoulToday(), subscriptions, goals, close, write }: Props) {
  const [id] = useState(() => record?.id ?? crypto.randomUUID())
  const [queued, setQueued] = useState(false)
  const [rejected, setRejected] = useState(false)
  const { register, watch, setValue, handleSubmit, formState } = useForm<Values<'transactions'>>({
    resolver: zodResolver(schemas.transactions),
    defaultValues: record ?? {
      name: '', type: initialType, amount: 0, date: initialDate, category: initialType === 'income' ? '용돈' : '기타',
      bucket: 'weekly', included: initialType !== 'income', memo: '', payment: '', subscriptionId: '', goalId: '',
    },
  })
  const type = watch('type')
  async function submit(values: Values<'transactions'>) {
    setQueued(true)
    setRejected(false)
    const ok = await write(saveRecord(uid, 'transactions', {
      ...values,
      subscriptionId: type === 'expense' ? values.subscriptionId : '',
      goalId: type === 'saving' ? values.goalId : '',
    }, id, record?.version))
    if (ok) close()
    else {
      setRejected(true)
      setQueued(false)
    }
  }
  return (
    <dialog open className="editor" aria-labelledby="transaction-title">
      <form onSubmit={handleSubmit(submit)}>
        <div className="row"><h2 id="transaction-title">{record ? '거래 수정' : '거래 추가'}</h2>
          <button className="secondary" type="button" onClick={close}>닫기</button></div>
        <div className="form-grid">
          <label>유형<select {...register('type')}>{Object.entries(transactionTypes).map(([key, name]) =>
            <option key={key} value={key}>{name}</option>)}</select></label>
          <label>거래일<input type="date" {...register('date')} required /></label>
          <label>거래명<input autoFocus maxLength={100} {...register('name')} required /></label>
          <label>금액 (원)<input type="number" min={1} max={1000000000} step={1} inputMode="numeric"
            {...register('amount', { valueAsNumber: true })} required /></label>
          <div className="shortcuts">{[1000, 5000, 10000].map(amount =>
            <button className="secondary" key={amount} type="button" onClick={() => setValue('amount', amount)}>
              {amount.toLocaleString('ko-KR')}원
            </button>)}</div>
          <label>카테고리<input maxLength={100} {...register('category')} required /></label>
          <label>결제 수단<input maxLength={100} {...register('payment')} /></label>
          {type === 'expense' && <>
            <label>예산 항목<select {...register('bucket')}>{Object.entries(buckets).map(([key, name]) =>
              <option key={key} value={key}>{name}</option>)}</select></label>
            <label>연결할 구독<select {...register('subscriptionId')}><option value="">선택 안 함</option>
              {subscriptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </>}
          {type === 'saving' && <label>저축 목표<select {...register('goalId')}><option value="">선택 안 함</option>
            {goals.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          {type !== 'income' && <label className="check"><input type="checkbox" {...register('included')} /> 예산에 포함</label>}
          <label className="wide">메모<textarea maxLength={500} {...register('memo')} /></label>
        </div>
        {Object.keys(formState.errors).length > 0 && <p className="error" role="alert">입력한 날짜와 금액, 이름을 확인해 주세요.</p>}
        {rejected && <p className="error" role="alert">서버가 이 변경을 받지 못했습니다. 충돌이 발생한 경우 최신 거래를 다시 열어 주세요.</p>}
        {queued && <p role="status">서버 반영 대기 중입니다. 창을 닫아도 저장 시도는 계속됩니다.</p>}
        <button disabled={queued}>{queued ? '서버 반영 대기' : '저장'}</button>
      </form>
    </dialog>
  )
}
