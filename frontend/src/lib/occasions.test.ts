import { describe, expect, it } from 'vitest'
import { nextOccurrence, occasions, ordinal } from './occasions'
import type { GraphFamily, GraphPerson, TreeGraph } from './treeLayout'

const date = (year: number, month: number, day: number, qualifier: 'exact' | 'about' = 'exact') => ({
  event_id: `e${year}${month}${day}`,
  place: null,
  date: { qualifier, year, month, day, year2: null, month2: null, day2: null, phrase: '', label: '', short: '' },
})

const person = (id: string, living: boolean, born?: ReturnType<typeof date>, died?: ReturnType<typeof date>): GraphPerson => ({
  id,
  display_name: id,
  given_names: id,
  surname: '',
  sex: 'unknown',
  is_living: living,
  linked_user_id: null,
  photo_id: null,
  birth: born ?? null,
  death: died ?? null,
})

const couple = (a: string, b: string, married: ReturnType<typeof date>, status: GraphFamily['status'] = 'together'): GraphFamily => ({
  id: `${a}+${b}`,
  status,
  partner_ids: [a, b],
  children: [],
  married: true,
  marriage: married.date,
})

// Saturday 26 September 2026.
const TODAY = new Date(2026, 8, 26)
const GRAPH: TreeGraph = {
  people: [
    person('tom', true, date(1992, 9, 26)),
    person('arthur', false, date(1931, 2, 1), date(2009, 9, 28)),
    person('beatrice', false),
    person('ellie', true, date(1989, 3, 2)),
    person('marco', true),
    person('grace', true, date(1994, 10, 10)),
    person('guess', true, date(1950, 9, 27, 'about')),
  ],
  families: [
    couple('arthur', 'beatrice', date(1958, 9, 26)),
    couple('ellie', 'marco', date(2015, 9, 27), 'divorced'),
  ],
}

describe('occasions', () => {
  it('finds birthdays, anniversaries and memorials in the week ahead, soonest first', () => {
    expect(occasions(GRAPH, TODAY).map((o) => [o.kind, o.people.join('+'), o.inDays, o.years])).toEqual([
      ['birthday', 'tom', 0, 34],
      ['anniversary', 'arthur+beatrice', 0, 68],
      ['memorial', 'arthur', 2, 17],
    ])
  })

  it('leaves out divorced couples, guessed dates and anything further off', () => {
    const kinds = occasions(GRAPH, TODAY).map((o) => o.people.join('+'))
    expect(kinds).not.toContain('ellie+marco')
    expect(kinds).not.toContain('guess')
    expect(kinds).not.toContain('grace')
    expect(occasions(GRAPH, TODAY, 20).map((o) => o.people[0])).toContain('grace')
  })

  it('handles the turn of the year and 29 February', () => {
    expect(nextOccurrence(1, 2, new Date(2026, 11, 30))).toEqual({ inDays: 3, year: 2027 })
    expect(nextOccurrence(2, 29, new Date(2027, 1, 27))).toEqual({ inDays: 1, year: 2027 })
    expect(nextOccurrence(2, 29, new Date(2028, 1, 27))).toEqual({ inDays: 2, year: 2028 })
  })

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 68, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '68th', '101st', '111th',
    ])
  })
})
