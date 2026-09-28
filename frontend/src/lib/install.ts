/**
 * Installing the web app on a phone or computer. Chrome, Edge and Android offer an install
 * prompt, which is kept here until someone taps Install. iPhone, iPad and Safari on a Mac have
 * no prompt, so they get instructions instead.
 */
import { useSyncExternalStore } from 'react'

/** Chromium's install prompt (not in TypeScript's DOM types). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * `prompt`: the browser can install it with one tap. `ios` and `mac-safari`: it can be added
 * from the browser's own menus. `other`: some other browser, which may or may not install apps.
 */
export type InstallState = 'installed' | 'prompt' | 'ios' | 'mac-safari' | 'other'

const INSTALLED_KEY = 'fv-installed'

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function remember(installed: boolean) {
  try {
    if (installed) localStorage.setItem(INSTALLED_KEY, '1')
    else localStorage.removeItem(INSTALLED_KEY)
  } catch {
    // Storage can be off (private windows); the page just can't tell it was installed.
  }
}

function remembered(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === '1'
  } catch {
    return false
  }
}

/** Call once at startup: browsers can offer their prompt before the app has rendered. */
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Hold the prompt for the Install buttons instead of letting the browser show its own.
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    // The browser only offers this when the app isn't installed (any more).
    remember(false)
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    remember(true)
    notify()
  })
}

/** Which kind of device and browser, from its user agent. iPads report themselves as Macs. */
export function platformOf(userAgent: string, maxTouchPoints: number): 'ios' | 'mac-safari' | 'other' {
  const mac = /Macintosh/.test(userAgent)
  if (/iPhone|iPad|iPod/.test(userAgent) || (mac && maxTouchPoints > 1)) return 'ios'
  if (mac && /Safari\//.test(userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(userAgent)) return 'mac-safari'
  return 'other'
}

/** Running as the installed app rather than in a browser tab. */
function standalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function currentState(): InstallState {
  if (standalone()) return 'installed'
  if (deferred) return 'prompt'
  if (remembered()) return 'installed'
  return platformOf(navigator.userAgent, navigator.maxTouchPoints)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Show the browser's install prompt. It can only be shown once, so the state moves on. */
async function install() {
  const event = deferred
  if (!event) return
  deferred = null
  await event.prompt()
  const { outcome } = await event.userChoice
  if (outcome === 'accepted') remember(true)
  notify()
}

export function useInstall() {
  const state = useSyncExternalStore(subscribe, currentState)
  return { state, install }
}
