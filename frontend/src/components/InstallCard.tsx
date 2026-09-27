import { DownloadSimple, Export } from '@phosphor-icons/react'
import { useState } from 'react'
import { useInstall } from '../lib/install'
import { Reveal } from './ui'

const DISMISSED_KEY = 'fv-install-card-dismissed'

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/** iPhone and iPad have no install button, only the Share menu. */
export function IosInstallSteps() {
  return (
    <>
      Tap Share <Export size={14} className="inline-icon" aria-hidden />, then “Add to Home Screen”.
    </>
  )
}

/**
 * On phones, a card on a tree's home page suggesting adding the app to the home screen. It
 * stays away once installed or dismissed; Settings still offers it after that.
 */
export default function InstallCard() {
  const { state, install } = useInstall()
  const [dismissed, setDismissed] = useState(wasDismissed)
  if (dismissed || (state !== 'prompt' && state !== 'ios')) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Storage can be off (private windows); it's hidden until the next visit.
    }
    setDismissed(true)
  }

  return (
    <Reveal className="span-6 phone-only">
      <section className="card install-card">
        <img src="/apple-touch-icon-180x180.png" alt="" width={44} height={44} className="install-icon" />
        <div className="grow">
          <p className="setting-label">Add TheFamilyVine to your home screen</p>
          <p className="muted small">
            {state === 'ios' ? (
              <IosInstallSteps />
            ) : (
              'It opens like any other app, and what you’ve viewed stays available offline.'
            )}
          </p>
        </div>
        <div className="actions">
          {state === 'prompt' && (
            <button type="button" className="btn btn-sm" onClick={() => void install()}>
              <DownloadSimple size={15} /> Install
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>
            Not now
          </button>
        </div>
      </section>
    </Reveal>
  )
}
