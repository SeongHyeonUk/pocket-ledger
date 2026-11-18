import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { app, emulatorMode } from './firebase'

export const trustedDevice = localStorage.getItem('ledger-trusted-device') === 'true'
export const db = app ? initializeFirestore(app, {
  localCache: trustedDevice
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    : memoryLocalCache(),
}) : null
if (emulatorMode && db) connectFirestoreEmulator(db, '127.0.0.1', 8080)
