import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { disableNetwork, enableNetwork, doc, getDoc, getDocFromCache, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { equal } from 'node:assert/strict'

test('UID isolation, validation, version conflicts, and deletion', async () => {
  const projectId = 'demo-pocket-ledger'
  const env = await initializeTestEnvironment({ projectId, firestore: {
    rules: await readFile('firestore.rules', 'utf8'),
  } })
  try {
    const path = 'users/alice/transactions/sample'
    const alice = doc(env.authenticatedContext('alice').firestore(), path)
    const bob = doc(env.authenticatedContext('bob').firestore(), path)
    const anonymous = doc(env.unauthenticatedContext().firestore(), path)
    const data = {
      id: 'sample', uid: 'alice', version: 1, deleted: false, name: '테스트',
      type: 'expense', date: '2026-11-18', amount: 1000, category: '식비', bucket: 'weekly',
      included: true, memo: '', payment: '', subscriptionId: '', goalId: '',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }
    await assertFails(setDoc(alice, { ...data, amount: -1 }))
    await assertFails(setDoc(bob, data))
    await assertSucceeds(setDoc(alice, data))
    await assertSucceeds(getDoc(alice))
    await assertFails(getDoc(bob))
    await assertFails(getDoc(anonymous))
    await assertFails(updateDoc(bob, { amount: 2000, version: 2, updatedAt: serverTimestamp() }))
    await assertFails(setDoc(alice, data))
    await assertSucceeds(updateDoc(alice, { amount: 2000, version: 2, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(alice, { amount: 3000, version: 2, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(alice, { deleted: true, version: 3, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(alice, { deleted: false, version: 4, updatedAt: serverTimestamp() }))
  } finally {
    await env.cleanup()
  }
})

test('two clients receive an offline edit after network recovery', { timeout: 15000 }, async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-pocket-ledger' })
  try {
    const path = 'users/sync/transactions/queued'
    const phoneDb = env.authenticatedContext('sync').firestore()
    const phone = doc(phoneDb, path)
    const desktop = doc(env.authenticatedContext('sync').firestore(), path)
    const data = {
      id: 'queued', uid: 'sync', version: 1, deleted: false, name: '오프라인 거래',
      type: 'expense', date: '2026-11-18', amount: 1000, category: '식비', bucket: 'weekly',
      included: true, memo: '', payment: '', subscriptionId: '', goalId: '',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }
    await assertSucceeds(setDoc(phone, data))
    await assertSucceeds(getDoc(desktop))
    await disableNetwork(phoneDb)
    const pending = new Promise((resolve, reject) => {
      const stop = onSnapshot(phone, { includeMetadataChanges: true }, snapshot => {
        if (!snapshot.metadata.hasPendingWrites) return
        stop()
        resolve(snapshot.data()?.amount)
      }, reject)
    })
    const write = updateDoc(phone, { amount: 2400, version: 2, updatedAt: serverTimestamp() })
    equal(await pending, 2400)
    equal((await getDocFromCache(phone)).data().amount, 2400)
    equal((await getDoc(desktop)).data().amount, 1000)
    const observed = new Promise((resolve, reject) => {
      const stop = onSnapshot(desktop, snapshot => {
        if (snapshot.data()?.amount !== 2400) return
        stop()
        resolve()
      }, reject)
    })
    await enableNetwork(phoneDb)
    await assertSucceeds(write)
    await observed
  } finally {
    await env.cleanup()
  }
})

test('subscription, goal, and budget rules enforce account and shape', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-pocket-ledger' })
  try {
    const owner = env.authenticatedContext('owner').firestore()
    const intruder = env.authenticatedContext('other').firestore()
    const docs = [
      ['subscriptions', 'a', { name: '구독', amount: 4400, cycle: 'monthly', active: true,
        nextDate: null, category: '구독료', memo: '', priceHistory: [], scheduleHistory: [] }],
      ['savingsGoals', 'a', { name: '저축', amount: 200000, memo: '' }],
      ['periods', '2026-12-10', { effective: '2026-12-10', startDay: 10, incomeDay: 10, expectedIncome: 450000,
        savings: 50000, transit: 70000, weekly: 30000, lottery: 5000, lotteryCycle: 'monthly', lotteryInWeekly: false }],
    ]
    for (const [kind, id, values] of docs) {
      const path = `users/owner/${kind}/${id}`
      const target = doc(owner, path)
      const data = { ...values, id, uid: 'owner', version: 1, deleted: false,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      await assertFails(setDoc(target, { ...data, unexpected: true }))
      await assertSucceeds(setDoc(target, data))
      await assertFails(getDoc(doc(intruder, path)))
      await assertSucceeds(updateDoc(target, { version: 2, updatedAt: serverTimestamp() }))
    }
  } finally {
    await env.cleanup()
  }
})

test('manual balance supports zero and only its owner can read or update it', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-pocket-ledger' })
  try {
    const owner = env.authenticatedContext('balance-owner').firestore()
    const other = env.authenticatedContext('other').firestore()
    const path = 'users/balance-owner/settings/main'
    const target = doc(owner, path)
    const record = { id: 'main', uid: 'balance-owner', balance: 0, version: 1, deleted: false,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
    await assertFails(setDoc(doc(other, path), record))
    await assertSucceeds(setDoc(target, record))
    await assertFails(getDoc(doc(other, path)))
    await assertFails(updateDoc(target, { balance: -1, version: 2, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(target, { balance: 120000, version: 2, updatedAt: serverTimestamp() }))
    equal((await getDoc(target)).data().balance, 120000)
  } finally {
    await env.cleanup()
  }
})

test('period and week adjustments are isolated and reject stale writes', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-pocket-ledger' })
  try {
    const owner = env.authenticatedContext('adjuster').firestore()
    const other = env.authenticatedContext('someone-else').firestore()
    for (const id of ['period-2026-11-10', 'week-2026-11-16']) {
      const path = `users/adjuster/adjustments/${id}`
      const target = doc(owner, path)
      const record = { id, uid: 'adjuster', amount: 30000, reference: -2500, version: 1, deleted: false,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      await assertSucceeds(setDoc(target, record))
      await assertFails(getDoc(doc(other, path)))
      await assertFails(updateDoc(target, { amount: 1000, version: 1, updatedAt: serverTimestamp() }))
      await assertSucceeds(updateDoc(target, { amount: 1000, version: 2, updatedAt: serverTimestamp() }))
      equal((await getDoc(target)).data().amount, 1000)
    }
  } finally {
    await env.cleanup()
  }
})
