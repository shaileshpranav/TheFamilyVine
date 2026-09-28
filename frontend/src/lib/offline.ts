/**
 * The installed app keeps what people view on the device, so it still opens offline: API
 * responses and photos, in the service worker caches named in vite.config.ts. That's one
 * person's family data, so it's forgotten on signing out, and whenever someone else signs in
 * on the same device.
 */

const CACHES = ['fv-api', 'fv-photos']
const OWNER_KEY = 'fv-offline-user'

function owner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

function setOwner(userId: string | null) {
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId)
    else localStorage.removeItem(OWNER_KEY)
  } catch {
    // Storage can be off (private windows); signing out still clears the caches.
  }
}

/** Forget everything kept for offline use. */
export async function clearOfflineData() {
  setOwner(null)
  if ('caches' in window) await Promise.all(CACHES.map((name) => caches.delete(name)))
}

/** Note whose data is being kept, clearing another person's first. */
export function claimOfflineData(userId: string) {
  const previous = owner()
  if (previous === userId) return
  if (previous) void clearOfflineData()
  setOwner(userId)
}
