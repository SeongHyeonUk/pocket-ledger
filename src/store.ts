import {
  collection, doc, getDocsFromServer, onSnapshot, orderBy, query, runTransaction, serverTimestamp,
  setDoc, updateDoc, where, type DocumentData, type QueryConstraint,
} from 'firebase/firestore'
import { db } from './database'
import { schemas, type Collection, type RecordOf, type Values } from './records'

function records(uid: string, name: Collection) {
  if (!db) throw new Error('Firebase 연결을 설정해 주세요.')
  return collection(db, 'users', uid, name)
}

const collections = Object.keys(schemas) as Collection[]

export async function readBackup(uid: string) {
  const docs = await Promise.all(collections.map(async collectionName => {
    const snapshot = await getDocsFromServer(query(records(uid, collectionName)))
    return snapshot.docs.flatMap(item => item.data().deleted && collectionName !== 'subscriptions' ? [] : [{
      collection: collectionName, id: item.id, deleted: !!item.data().deleted, values: schemas[collectionName].parse(item.data()),
    }])
  }))
  return docs.flat()
}

export async function mergeBackup(uid: string, entries: Awaited<ReturnType<typeof readBackup>>) {
  if (!db) throw new Error('Firebase 연결을 설정해 주세요.')
  return runTransaction(db, async transaction => {
    const targets = entries.map(entry => doc(records(uid, entry.collection), entry.id))
    const existing = await Promise.all(targets.map(target => transaction.get(target)))
    let added = 0
    entries.forEach((entry, index) => {
      if (existing[index].exists()) return
      transaction.set(targets[index], {
        ...schemas[entry.collection].parse(entry.values), id: entry.id, uid,
        version: 1, deleted: entry.deleted, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      added++
    })
    return { added, skipped: entries.length - added }
  })
}

export function watchRecords<K extends Collection>(
  uid: string, name: K, onChange: (items: RecordOf<K>[], cached: boolean, pending: boolean) => void,
  onError: (error: Error) => void, range?: { start: string; end: string }, savingsOnly = false,
) {
  const constraints: QueryConstraint[] = []
  if (name === 'transactions' && range) {
    constraints.push(where('date', '>=', range.start), where('date', '<=', range.end), orderBy('date', 'desc'))
  }
  if (name === 'transactions' && savingsOnly) constraints.push(where('type', '==', 'saving'))
  return onSnapshot(query(records(uid, name), ...constraints), { includeMetadataChanges: true }, snapshot => {
    const items = snapshot.docs.flatMap(item => {
      const data: DocumentData = item.data()
      if (data.deleted && name !== 'subscriptions') return []
      const result = schemas[name].safeParse(data)
      if (!result.success) {
        onError(new Error('저장된 문서의 형식을 확인할 수 없습니다.'))
        return []
      }
      return [{ ...result.data, id: item.id, uid, version: data.version, deleted: !!data.deleted } as RecordOf<K>]
    })
    onChange(items, snapshot.metadata.fromCache, snapshot.metadata.hasPendingWrites)
  }, onError)
}

export function saveRecord<K extends Collection>(
  uid: string, name: K, values: Values<K>, id: string, previousVersion?: number,
) {
  const parsed = schemas[name].parse(values)
  const target = doc(records(uid, name), id)
  const change = { ...parsed, updatedAt: serverTimestamp() }
  return previousVersion === undefined
    ? setDoc(target, { ...change, id, uid, version: 1, deleted: false, createdAt: serverTimestamp() })
    : updateDoc(target, { ...change, version: previousVersion + 1 })
}

export function deleteRecord(uid: string, name: Collection, id: string, previousVersion: number,
  subscription?: Pick<Values<'subscriptions'>, 'scheduleHistory'>) {
  return updateDoc(doc(records(uid, name), id), {
    ...subscription, deleted: true, version: previousVersion + 1, updatedAt: serverTimestamp(),
  })
}
