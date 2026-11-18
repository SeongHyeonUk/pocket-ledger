import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

type InstallEvent = Event & { prompt(): Promise<void> }

export function PwaControls() {
  const [install, setInstall] = useState<InstallEvent>()
  const [update, setUpdate] = useState<() => Promise<void>>()
  const [blocked, setBlocked] = useState(false)
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && navigator.standalone === true)
  const iosSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent)

  useEffect(() => {
    const prompt = (event: Event) => {
      event.preventDefault()
      setInstall(event as InstallEvent)
    }
    const clear = () => setInstall(undefined)
    window.addEventListener('beforeinstallprompt', prompt)
    window.addEventListener('appinstalled', clear)
    const apply = registerSW({ onNeedRefresh: () => setUpdate(() => () => apply(true)) })
    return () => {
      window.removeEventListener('beforeinstallprompt', prompt)
      window.removeEventListener('appinstalled', clear)
    }
  }, [])

  if (standalone && !update) return null
  if (!install && !update && !iosSafari) return null
  return <aside className="pwa-controls" aria-label="앱 설치 및 업데이트">
    {update && <div className="row"><span>새 버전이 있습니다.</span><button type="button" onClick={() => {
      if (document.querySelector('dialog[open], [data-pending="true"]')) {
        setBlocked(true)
        return
      }
      void update()
    }}>업데이트</button></div>}
    {blocked && <p role="status">작성을 마치고 서버 반영을 확인한 뒤 다시 시도해 주세요.</p>}
    {!standalone && install && <button type="button" onClick={() => {
      void install.prompt().catch(() => {}).finally(() => setInstall(undefined))
    }}>Pocket Ledger 설치</button>}
    {!standalone && !install && iosSafari && <p>Safari 공유 메뉴에서 ‘홈 화면에 추가’를 선택하세요.</p>}
  </aside>
}
