import { useEffect, useState } from 'react'
import { watchRecords } from './store'
import type { Collection, RecordOf } from './records'

export function useRecords<K extends Collection>(uid: string, name: K, range?: { start: string; end: string }, savingsOnly = false) {
  const start = range?.start
  const end = range?.end
  const key = JSON.stringify([uid, name, start, end, savingsOnly])
  const [snapshot, setSnapshot] = useState<{
    key: string
    items: RecordOf<K>[]
    cached: boolean
    pending: boolean
  }>()
  const [failure, setFailure] = useState<{ key: string; error: string }>()
  useEffect(() => watchRecords(uid, name, (items, cached, pending) => {
    setSnapshot({ key, items, cached, pending })
  }, error => {
    setFailure({ key, error: error.message })
  }, start && end ? { start, end } : undefined, savingsOnly), [uid, name, start, end, key, savingsOnly])

  return {
    items: snapshot?.key === key ? snapshot.items : [],
    ready: snapshot?.key === key && (!snapshot.cached || snapshot.items.length > 0),
    cached: snapshot?.key !== key || snapshot.cached,
    pending: snapshot?.key === key && snapshot.pending,
    error: failure?.key === key ? failure.error : '',
  }
}
