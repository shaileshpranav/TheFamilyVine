/**
 * Preview mode (development builds only): open any page with `?preview` to see it filled
 * with the sample Hollis family instead of real data, without signing in. Add a role to
 * see that role's view (`?preview=contributor`), and `?preview=off` to leave. Nothing is
 * saved; the sample API rejects every change.
 */
import type { Role } from './api/client'

const KEY = 'ft-preview'
const ROLES: Role[] = ['owner', 'admin', 'contributor', 'personal']

function read(): Role | null {
  if (!import.meta.env.DEV) return null
  try {
    const param = new URLSearchParams(window.location.search).get('preview')
    if (param !== null) {
      if (param === 'off') {
        sessionStorage.removeItem(KEY)
        return null
      }
      const role = (ROLES as string[]).includes(param) ? (param as Role) : 'owner'
      sessionStorage.setItem(KEY, role)
      return role
    }
    const stored = sessionStorage.getItem(KEY)
    return stored && (ROLES as string[]).includes(stored) ? (stored as Role) : null
  } catch {
    return null
  }
}

export const previewRole: Role | null = read()

export function exitPreview() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Storage unavailable: the flag wasn't persisted either.
  }
  window.location.href = '/'
}
