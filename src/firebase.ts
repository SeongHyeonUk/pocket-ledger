import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth'

export const emulatorMode = import.meta.env.MODE === 'emulator'
const config = emulatorMode ? {
  apiKey: 'demo-pocket-ledger',
  authDomain: 'demo-pocket-ledger.firebaseapp.com',
  projectId: 'demo-pocket-ledger',
  appId: 'demo-pocket-ledger',
} : {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_PUBLIC_HOST || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = Object.values(config).every(Boolean) ? initializeApp(config) : null
export const auth = app ? getAuth(app) : null
if (emulatorMode && auth) connectAuthEmulator(auth, 'http://127.0.0.1:9099')
export const google = new GoogleAuthProvider()
