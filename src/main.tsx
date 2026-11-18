import { lazy, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { getRedirectResult, onAuthStateChanged, signInAnonymously, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth'
import { Wallet } from 'lucide-react'
import { auth, emulatorMode, google } from './firebase'
import { PwaControls } from './pwa'
import './styles.css'

const Ledger = lazy(() => import('./ledger'))
const redirectSupported = auth?.app.options.authDomain === window.location.hostname

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!auth) return
    if (redirectSupported) void getRedirectResult(auth).catch(() =>
      setError('Google 로그인 결과를 확인하지 못했습니다. 다시 시도해 주세요.'))
    return onAuthStateChanged(auth, setUser, () => {
      setError('로그인 상태를 확인할 수 없습니다. 다시 시도해 주세요.')
      setUser(null)
    })
  }, [])

  async function changeSession(testLogin = false) {
    if (!auth || busy) return
    setBusy(true)
    setError('')
    try {
      if (user) await signOut(auth)
      else if (testLogin && emulatorMode) await signInAnonymously(auth)
      else if (redirectSupported && window.matchMedia('(pointer: coarse), (display-mode: standalone)').matches) {
        await signInWithRedirect(auth, google)
      } else {
        await signInWithPopup(auth, google).catch(cause => {
          if (redirectSupported && cause?.code === 'auth/popup-blocked' && auth) return signInWithRedirect(auth, google)
          throw cause
        })
      }
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : ''
      const messages: Record<string, string> = {
        'auth/popup-blocked': '브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.',
        'auth/popup-closed-by-user': '로그인 창이 닫혔습니다. 다시 시도해 주세요.',
        'auth/unauthorized-domain': '이 접속 주소는 Google 로그인이 허용되지 않았습니다.',
        'auth/operation-not-allowed': 'Firebase에서 Google 로그인을 활성화해야 합니다.',
      }
      setError(messages[String(code)] ?? '요청을 완료하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  if (user) return <Suspense fallback={<p role="status">가계부를 여는 중입니다.</p>}>
    {error && <p role="alert" className="error">{error}</p>}
    <Ledger uid={user.uid} key={user.uid} logout={() => void changeSession()} />
  </Suspense>

  return (
    <main className="welcome">
      <section className="welcome-card" aria-labelledby="app-name">
        <span className="brand-icon"><Wallet size={28} aria-hidden="true" /></span>
        <h1 id="app-name">Pocket Ledger</h1>
        {!auth ? <p>Firebase 연결 설정이 필요합니다.</p>
          : user === undefined ? <p role="status">로그인 상태 확인 중</p>
            : <>
              <p>Google 계정으로 가계부에 로그인하세요.</p>
              <button type="button" onClick={() => void changeSession()} disabled={busy}>
                {busy ? '처리 중…' : 'Google로 로그인'}
              </button>
              {emulatorMode && <button type="button" disabled={busy} onClick={() => void changeSession(true)}>테스트 계정으로 로그인</button>}
            </>}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
    <PwaControls />
  </BrowserRouter>,
)
