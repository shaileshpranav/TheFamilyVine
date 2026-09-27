import { ArrowClockwise, WifiSlash } from '@phosphor-icons/react'
import { useSyncExternalStore } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const HOUR = 60 * 60 * 1000

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/**
 * Notes along the bottom of the screen: when the device is offline, and when a new version of
 * the app has been deployed. Also registers the service worker (production builds only).
 */
export default function AppStatus() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // An installed app can stay open for days, so look for a new version now and then.
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => void registration.update().catch(() => {})
      setInterval(check, HOUR)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    },
  })

  if (online && !needRefresh) return null
  return (
    <div className="app-status" role="status">
      {!online && (
        <div className="app-note">
          <WifiSlash size={16} />
          <span className="grow">You’re offline. Showing what you last viewed.</span>
        </div>
      )}
      {needRefresh && (
        <div className="app-note">
          <ArrowClockwise size={16} />
          <span className="grow">A new version of TheFamilyVine is ready.</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void updateServiceWorker()}>
            Reload
          </button>
        </div>
      )}
    </div>
  )
}
