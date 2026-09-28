import { describe, expect, it } from 'vitest'
import { Kin, bloodTerm, relationToYou } from './relationship'
import type { GraphFamily, GraphPerson, TreeGraph } from './treeLayout'

const person = (id: string, sex: GraphPerson['sex']): GraphPerson => ({
  id,
  display_name: id,
  given_names: id,
  surname: '',
  sex,
  is_living: true,
  linked_user_id: null,
  photo_id: null,
  birth: null,
  death: null,
})

const family = (
  partners: string[],
  children: string[],
  extra: Partial<GraphFamily> = {},
): GraphFamily => ({
  id: `${partners.join('+') || children.join('~')}`,
  status: 'together',
  partner_ids: partners,
  children: children.map((c) => ({ person_id: c, relation: 'biological' as const })),
  married: false,
  marriage: null,
  ...extra,
})
const married = { married: true }
const divorced = { married: true, status: 'divorced' as const }

// Everyone is named by what they are to "me".
const F = 'female'
const M = 'male'
const TREE: TreeGraph = {
  people: [
    person('gg1', M), person('gg2', F),
    person('g1', M), person('g2', F), person('g3', F), person('gs', F), person('gsh', M),
    person('p1', M), person('p1w', F), person('p2', F), person('p2h', M), person('p3', 'unknown'),
    person('ph', M), person('c1', F), person('st', F), person('stk', M), person('stp', F),
    person('me', F), person('sib', F), person('sibp', M), person('cousin', M), person('c1k', M),
    person('w', M), person('wp', F), person('ws', F), person('wsh', M), person('ex', M), person('exm', F),
    person('mek', M), person('mekw', F), person('cousink', F), person('mekk', F),
    person('x', F), person('y', M), person('xk', F), person('yk', M), person('z', F),
  ],
  families: [
    family(['gg1', 'gg2'], ['g1', 'gs'], married),
    family(['g1', 'g2'], ['p1', 'p2', 'p3'], married),
    family(['g1', 'g3'], ['ph']),
    family(['gs', 'gsh'], ['c1'], married),
    family(['p1', 'p1w'], ['me', 'sib'], married),
    family(['p1', 'st'], []),
    family(['st'], ['stk']),
    family(['stp'], ['st']),
    family(['p2', 'p2h'], ['cousin'], divorced),
    family(['c1'], ['c1k']),
    family(['me', 'w'], ['mek'], married),
    family(['me', 'ex'], [], divorced),
    family(['sib', 'sibp'], []),
    family(['cousin'], ['cousink']),
    family(['wp'], ['w', 'ws']),
    family(['ws', 'wsh'], [], married),
    family(['exm'], ['ex']),
    family(['mek', 'mekw'], ['mekk'], married),
    family([], ['x', 'y']),
    family(['x'], ['xk']),
    family(['y'], ['yk']),
  ],
}

describe('Kin.relate', () => {
  const kin = new Kin(TREE)
  const title = (to: string, from = 'me') => kin.relate(from, to).title

  it('names blood relatives through their nearest shared ancestors', () => {
    expect({
      p1: title('p1'), p1w: title('p1w'), g1: title('g1'), g2: title('g2'), gg1: title('gg1'),
      sib: title('sib'), p2: title('p2'), gs: title('gs'), mek: title('mek'), mekk: title('mekk'),
      cousin: title('cousin'), c1: title('c1'), c1k: title('c1k'), cousink: title('cousink'),
    }).toEqual({
      p1: 'Father', p1w: 'Mother', g1: 'Grandfather', g2: 'Grandmother', gg1: 'Great-grandfather',
      sib: 'Sister', p2: 'Aunt', gs: 'Great-aunt', mek: 'Son', mekk: 'Granddaughter',
      cousin: 'First cousin', c1: 'First cousin once removed', c1k: 'Second cousin',
      cousink: 'First cousin once removed',
    })
    expect(title('mekk', 'gg1')).toBe('3× great-granddaughter')
    expect(title('me', 'p1')).toBe('Daughter')
  })

  it('uses half- when only one parent’s line is shared, and neutral words without a sex', () => {
    expect(title('ph')).toBe('Half-uncle')
    expect(title('p3')).toBe('Aunt or uncle')
    expect(bloodTerm(3, 1, 'other')).toBe('great-aunt or great-uncle')
    expect(bloodTerm(2, 4, 'female', true)).toBe('half first cousin twice removed')
  })

  it('treats siblings recorded without parents as sharing them', () => {
    expect(title('y', 'x')).toBe('Brother')
    expect(title('yk', 'xk')).toBe('First cousin')
  })

  it('names partners, step relatives and in-laws', () => {
    expect({
      w: title('w'), ex: title('ex'), st: title('st'), stk: title('stk'), stp: title('stp'),
      wp: title('wp'), ws: title('ws'), exm: title('exm'), mekw: title('mekw'),
      gsh: title('gsh'), sibp: title('sibp'), p2h: title('p2h'), wsh: title('wsh'),
    }).toEqual({
      w: 'Husband', ex: 'Former husband', st: 'Step-mother', stk: 'Step-brother', stp: 'Step-grandmother',
      wp: 'Mother-in-law', ws: 'Sister-in-law', exm: 'Former mother-in-law', mekw: 'Daughter-in-law',
      gsh: 'Great-uncle', sibp: 'Sister’s partner', p2h: 'Aunt’s former husband',
      wsh: 'Husband’s sister’s husband',
    })
    expect(title('me', 'st')).toBe('Step-daughter')
    expect(kin.relate('me', 'gsh').detail).toBe('Married to gs')
  })

  it('traces the chain between them, labelling each step', () => {
    const rel = kin.relate('me', 'c1k')
    expect(rel.path).toEqual([
      { id: 'me', role: null },
      { id: 'p1', role: 'father' },
      { id: 'g1', role: 'father' },
      { id: 'gg1', role: 'father' },
      { id: 'gs', role: 'daughter' },
      { id: 'c1', role: 'daughter' },
      { id: 'c1k', role: 'son' },
    ])
    expect(kin.relate('me', 'cousin').detail).toBe('Through g1 and g2')
    expect(kin.relate('me', 'sib').detail).toBe('Both children of p1 and p1w')
    expect(kin.relate('me', 'st').path.map((s) => s.role)).toEqual([null, 'father', 'partner'])
  })

  it('says so when they aren’t connected', () => {
    expect(kin.relate('me', 'z')).toMatchObject({ kind: 'none', path: [] })
    expect(kin.relate('me', 'nobody').kind).toBe('none')
    expect(kin.relate('me', 'me').kind).toBe('self')
  })

  it('reads as a label for the viewer', () => {
    expect(relationToYou(kin.relate('me', 'c1'))).toBe('Your first cousin once removed')
    expect(relationToYou(kin.relate('me', 'me'))).toBe('You')
    expect(relationToYou(kin.relate('me', 'z'))).toBeNull()
  })
})
