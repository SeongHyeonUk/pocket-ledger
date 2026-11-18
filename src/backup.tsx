import { useState } from 'react'
import { z } from 'zod'
import { mergeBackup, readBackup } from './store'
import { schemas, type Collection } from './records'

const collections = Object.keys(schemas) as [Collection, ...Collection[]]
const fileSchema = z.object({
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  entries: z.array(z.object({
    collection: z.enum(collections), id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), deleted: z.boolean().default(false),
    values: z.unknown(),
  })),
})

export function validateBackup(data: unknown) {
  const file = fileSchema.parse(data)
  const seen = new Set<string>()
  return file.entries.map(({ collection, id, deleted, values }) => {
    const key = collection + '/' + id
    if (seen.has(key)) throw new Error('백업에 중복된 문서 ID가 있습니다.')
    seen.add(key)
    const parsed = schemas[collection].parse(values)
    if ('effective' in parsed && parsed.effective !== id) throw new Error('예산 설정의 적용일이 잘못되었습니다.')
    if (collection === 'settings' && id !== 'main') throw new Error('보유 총액 설정의 ID가 잘못되었습니다.')
    if (collection === 'adjustments' && !/^(period|week|lottery)-\d{4}-\d{2}-\d{2}$/.test(id)) throw new Error('예산 조정 ID가 잘못되었습니다.')
    if (deleted && collection !== 'subscriptions') throw new Error('백업의 삭제 상태가 잘못되었습니다.')
    return { collection, id, deleted, values: parsed }
  })
}

export function csvCell(value: unknown) {
  let text = String(value ?? '')
  if (typeof value === 'string' && /^[\s]*[=+\-@\t\r\n]/.test(text)) text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}

function saveFile(name: string, content: string, type: string) {
  const href = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

export function Backup({ uid, disabled }: { uid: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setStatus('')
    try { await action() }
    catch (error) { setStatus(error instanceof Error && error.name !== 'FirebaseError' && error.name !== 'ZodError'
      ? error.message : '온라인 연결과 백업 파일 형식을 확인해 주세요.') }
    finally { setBusy(false) }
  }

  async function exportData(format: 'json' | 'csv') {
    const entries = await readBackup(uid)
    const exportedAt = new Date().toISOString()
    const filename = 'pocket-ledger-' + exportedAt.slice(0, 10)
    if (format === 'json') {
      saveFile(filename + '.json', JSON.stringify({ version: 1, exportedAt, entries }, null, 2), 'application/json')
    } else {
      const rows = [['날짜', '유형', '거래명', '금액', '카테고리', '결제 수단', '예산 포함', '메모']]
      const tx = entries.flatMap(entry => entry.collection === 'transactions' ? [schemas.transactions.parse(entry.values)] : [])
      tx.sort((a, b) => b.date.localeCompare(a.date))
      const labels = { income: '수입', expense: '지출', saving: '저축 이체' }
      const records = tx.map(item => [item.date, labels[item.type], item.name, item.amount,
        item.category, item.payment, item.included ? '예' : '아니요', item.memo])
      saveFile(filename + '.csv', '\uFEFF' + [...rows, ...records].map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8')
    }
    setStatus('백업 파일을 생성했습니다.')
  }

  return <section className="card" data-pending={busy}>
    <h2>백업 및 복원</h2>
    <p>백업 파일에는 가계부 기록이 포함됩니다. 개인 기기에 보관하세요.</p>
    <div className="actions spaced">
      <button className="secondary" disabled={disabled || busy} onClick={() => void run(() => exportData('json'))}>JSON 백업</button>
      <button className="secondary" disabled={disabled || busy} onClick={() => void run(() => exportData('csv'))}>거래 CSV</button>
    </div>
    <label className="file-input spaced">JSON 복원<input type="file" accept=".json,application/json" disabled={disabled || busy}
      onChange={event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        void run(async () => {
          if (file.size > 20_000_000) throw new Error('복원 파일은 20MB 이하여야 합니다.')
          const entries = validateBackup(JSON.parse(await file.text()))
          if (entries.length && window.confirm(`${entries.length}개 항목을 가져올까요? 기존 문서는 건너뜁니다.`)) {
            let added = 0
            let skipped = 0
            for (let start = 0; start < entries.length; start += 200) {
              try {
                const result = await mergeBackup(uid, entries.slice(start, start + 200))
                added += result.added
                skipped += result.skipped
                setStatus(`추가 ${added}개 · 기존 항목 ${skipped}개`)
              } catch {
                throw new Error(`추가 ${added}개 · 기존 항목 ${skipped}개 처리 후 중단됐습니다. 같은 파일을 다시 선택하면 남은 항목을 이어서 가져옵니다.`)
              }
            }
          }
        })
      }} /></label>
    {status && <p role="status">{status}</p>}
  </section>
}
