import type { Schemas } from '../api/client'

export type FuzzyDate = Schemas['FuzzyDate']
export type FuzzyDateOut = Schemas['FuzzyDateOut']
type Vital = Schemas['VitalOut']

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function parts(year?: number | null, month?: number | null, day?: number | null): string {
  if (!year) return ''
  if (!month) return String(year)
  if (!day) return `${MONTHS[month - 1]} ${year}`
  return `${day} ${MONTHS[month - 1]} ${year}`
}

/** Same wording as the API's `label` (app/dates.py), for live previews while typing. */
export function dateLabel(d: FuzzyDate): string {
  const start = parts(d.year, d.month, d.day)
  if (!start) return d.phrase?.trim() ?? ''
  switch (d.qualifier) {
    case 'about':
      return `about ${start}`
    case 'before':
      return `before ${start}`
    case 'after':
      return `after ${start}`
    case 'between':
      return `between ${start} and ${parts(d.year2, d.month2, d.day2)}`
    default:
      return start
  }
}

/** Same wording as the API's `short`: "1931", "c. 1920", "bef. 1885", "1900–1905". */
export function dateShort(d: FuzzyDate): string {
  if (!d.year) return ''
  switch (d.qualifier) {
    case 'about':
      return `c. ${d.year}`
    case 'before':
      return `bef. ${d.year}`
    case 'after':
      return `aft. ${d.year}`
    case 'between':
      return d.year === d.year2 ? String(d.year) : `${d.year}–${d.year2}`
    default:
      return String(d.year)
  }
}

/** "1931 – 2009", "b. 1957", "d. 1985", or "" when nothing is known. */
export function lifespan(birth?: Vital | null, death?: Vital | null): string {
  const b = birth?.date?.short
  const d = death?.date?.short
  if (b && d) return `${b} – ${d}`
  if (b) return `b. ${b}`
  if (d) return `d. ${d}`
  return ''
}

const SIGNS: [string, number, number][] = [
  // sign, last month, last day (the sign runs up to and including this date)
  ['Capricorn', 1, 19],
  ['Aquarius', 2, 18],
  ['Pisces', 3, 20],
  ['Aries', 4, 19],
  ['Taurus', 5, 20],
  ['Gemini', 6, 20],
  ['Cancer', 7, 22],
  ['Leo', 8, 22],
  ['Virgo', 9, 22],
  ['Libra', 10, 22],
  ['Scorpio', 11, 21],
  ['Sagittarius', 12, 21],
  ['Capricorn', 12, 31],
]

/** Western zodiac sign for an exact day and month, otherwise null. */
export function zodiac(d?: FuzzyDate | null): string | null {
  if (!d || d.qualifier !== 'exact' || !d.month || !d.day) return null
  const match = SIGNS.find(([, m, day]) => d.month! < m || (d.month === m && d.day! <= day))
  return match?.[0] ?? null
}

/** A typed-in year as a date: exact, or "about" when approximate. Blank or invalid is none. */
export function yearDate(year: string, approximate = false): FuzzyDate | null {
  const y = Number(year)
  if (!year.trim() || !Number.isInteger(y) || y < 1) return null
  return { qualifier: approximate ? 'about' : 'exact', year: y }
}

