import type { CSSProperties } from 'react'

export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return letters || '?'
}

/** Index for staggered list entrances (`.stagger > *`). */
export function staggerIndex(i: number): CSSProperties {
  return { '--i': i } as CSSProperties
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "just now", "3 hours ago", "yesterday", "2 weeks ago" … */
export function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}
