/**
 * App settings from the account: appearance, text size and where opening a tree lands.
 * index.html applies the last-used appearance before the first paint; this keeps the page in
 * step once the account has loaded, and whenever a setting changes.
 */
import { useEffect } from 'react'
import type { Schemas } from '../api/client'

export type Preferences = Schemas['Preferences']

export const DEFAULT_PREFERENCES: Preferences = { theme: 'system', text_size: 'normal', start_page: 'home' }

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

/** Show the chosen appearance and text size now, and remember them for the next page load. */
export function applyPreferences(p: Preferences) {
  const root = document.documentElement
  const theme = p.theme === 'system' ? (systemDark() ? 'dark' : 'light') : p.theme
  root.dataset.theme = theme
  if (p.text_size === 'large') root.dataset.text = 'large'
  else delete root.dataset.text
  // Phones tint their browser bars to match.
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute('content', theme === 'dark' ? '#191918' : '#f7f6f3'))
  try {
    localStorage.setItem('fv-theme', p.theme)
    localStorage.setItem('fv-text', p.text_size)
  } catch {
    // Storage can be off (private windows): the settings still apply, just not before paint.
  }
}

/** Keep the page in step with the account's settings, and with the system when following it. */
export function usePreferences(p: Preferences | undefined) {
  useEffect(() => {
    if (!p) return
    applyPreferences(p)
    if (p.theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = () => applyPreferences(p)
    media.addEventListener('change', follow)
    return () => media.removeEventListener('change', follow)
  }, [p])
}

/** Where opening a tree lands: its home page, or straight on the tree. */
export const treeLink = (treeId: string, p: Preferences | undefined) =>
  p?.start_page === 'tree' ? `/trees/${treeId}/tree` : `/trees/${treeId}`
