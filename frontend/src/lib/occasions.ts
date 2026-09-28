/**
 * Birthdays, wedding anniversaries and memorials falling today or in the week ahead.
 *
 * Works from the tree graph, so only people the viewer can see appear. Only full dates count:
 * a day and month known exactly. Birthdays are for the living, memorials for the dead, and
 * anniversaries for couples still together (including those parted by death).
 */
import type { GraphPerson, TreeGraph } from './treeLayout'

type FuzzyDate = NonNullable<NonNullable<GraphPerson['birth']>['date']>

export interface Occasion {
  key: string
  kind: 'birthday' | 'anniversary' | 'memorial'
  /** Days from today, 0 being today. */
  inDays: number
  /** The age turned, or years married, or years since they died. */
  years: number
  /** The year it began. */
  since: number
  people: string[]
}

const ORDER: Record<Occasion['kind'], number> = { birthday: 0, anniversary: 1, memorial: 2 }

const exact = (d: FuzzyDate | null | undefined) =>
  d && d.qualifier === 'exact' && d.year && d.month && d.day ? { year: d.year, month: d.month, day: d.day } : null

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** How many days until a day and month next come round (0 is today), and in which year. */
export function nextOccurrence(month: number, day: number, today: Date): { inDays: number; year: number } {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  for (let year = start.getFullYear(); ; year++) {
    // 29 February is marked on the 28th in other years.
    const date = month === 2 && day === 29 && !isLeap(year) ? new Date(year, 1, 28) : new Date(year, month - 1, day)
    const inDays = Math.round((date.getTime() - start.getTime()) / 86_400_000)
    if (inDays >= 0) return { inDays, year }
  }
}

export function occasions(graph: TreeGraph, today = new Date(), withinDays = 7): Occasion[] {
  const out: Occasion[] = []
  const add = (kind: Occasion['kind'], date: ReturnType<typeof exact>, people: string[]) => {
    if (!date) return
    const next = nextOccurrence(date.month, date.day, today)
    const years = next.year - date.year
    if (next.inDays > withinDays || years <= 0) return
    out.push({ key: `${kind}:${people.join('+')}`, kind, inDays: next.inDays, years, since: date.year, people })
  }
  for (const p of graph.people) {
    if (p.is_living) add('birthday', exact(p.birth?.date), [p.id])
    else add('memorial', exact(p.death?.date), [p.id])
  }
  for (const f of graph.families) {
    if (f.partner_ids.length === 2 && f.status === 'together') add('anniversary', exact(f.marriage), f.partner_ids)
  }
  return out.sort((a, b) => a.inDays - b.inDays || ORDER[a.kind] - ORDER[b.kind])
}

/** 1st, 2nd, 3rd, 4th… 11th, 12th, 13th… 21st. */
export function ordinal(n: number): string {
  const teens = n % 100 >= 11 && n % 100 <= 13
  const suffix = teens ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}
