import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import {
  type GraphFamily,
  type GraphPerson,
  NODE_H,
  NODE_W,
  TILE,
  type TreeGraph,
  assignGenerations,
  layoutTree,
  treeLines,
} from './treeLayout'

function person(id: string, birth?: number): GraphPerson {
  return {
    id,
    display_name: id,
    given_names: id,
    surname: '',
    sex: 'unknown',
    is_living: true,
    linked_user_id: null,
    death: null,
    birth: birth
      ? {
          event_id: `birth-${id}`,
          place: null,
          date: {
            qualifier: 'exact',
            year: birth,
            month: null,
            day: null,
            year2: null,
            month2: null,
            day2: null,
            phrase: '',
            label: String(birth),
            short: String(birth),
          },
        }
      : null,
  }
}

function family(
  id: string,
  partners: string[],
  children: string[],
  status: GraphFamily['status'] = 'together',
): GraphFamily {
  return {
    id,
    status,
    partner_ids: partners,
    children: children.map((c) => ({ person_id: c, relation: 'biological' })),
    marriage: null,
  }
}

/** The Hollis family from the design. Grace's mother isn't recorded; Susan is her step-mother. */
const HOLLIS: TreeGraph = {
  people: [
    person('arthur', 1931),
    person('beatrice', 1934),
    person('james', 1955),
    person('margaret', 1957),
    person('david', 1961),
    person('susan', 1964),
    person('ellie', 1989),
    person('marco', 1987),
    person('tom', 1992),
    person('grace', 1994),
    person('sofia', 2018),
  ],
  families: [
    family('lane', ['arthur', 'beatrice'], ['margaret', 'david']),
    family('hollis', ['james', 'margaret'], ['ellie', 'tom']),
    family('david', ['david'], ['grace']),
    family('david-susan', ['david', 'susan'], [], 'separated'),
    family('ellie-marco', ['ellie', 'marco'], ['sofia'], 'divorced'),
  ],
}

const rowsOf = (graph: TreeGraph) => Object.fromEntries(assignGenerations(graph))

describe('assignGenerations', () => {
  it('puts each generation of the Hollis family on its own row', () => {
    expect(rowsOf(HOLLIS)).toEqual({
      arthur: 0, beatrice: 0,
      james: 1, margaret: 1, david: 1, susan: 1,
      ellie: 2, marco: 2, tom: 2, grace: 2,
      sofia: 3,
    })
  })

  it('places an in-law’s parents just above the in-law, not at the top', () => {
    const graph: TreeGraph = {
      people: [...HOLLIS.people, person('nonno'), person('nonna')],
      families: [...HOLLIS.families, family('russo', ['nonno', 'nonna'], ['marco'])],
    }
    const rows = rowsOf(graph)
    expect(rows.nonno).toBe(1)
    expect(rows.nonna).toBe(1)
    expect(rows.marco).toBe(2)
  })

  it('keeps siblings with no recorded parents on one row', () => {
    const graph: TreeGraph = {
      people: [person('a'), person('b'), person('kid')],
      families: [family('sibs', [], ['a', 'b']), family('a-kid', ['a'], ['kid'])],
    }
    expect(rowsOf(graph)).toEqual({ a: 0, b: 0, kid: 1 })
  })

  it('survives data that loops back on itself', () => {
    const graph: TreeGraph = {
      people: [person('x'), person('y')],
      families: [family('xy', ['x'], ['y']), family('yx', ['y'], ['x'])],
    }
    const rows = rowsOf(graph)
    expect(Object.keys(rows)).toEqual(['x', 'y'])
  })
})

describe('layoutTree', () => {
  const elk = new ELK()

  it('puts partners side by side and children below their parents', async () => {
    const layout = await layoutTree(HOLLIS, elk)
    const pos = (id: string) => layout.positions.get(id)!
    expect(pos('james').y).toBe(pos('margaret').y)
    expect(Math.abs(pos('james').x - pos('margaret').x)).toBeLessThan(NODE_W * 2)
    expect(pos('ellie').y).toBeGreaterThan(pos('margaret').y)
    expect(pos('sofia').y).toBeGreaterThan(pos('ellie').y)
  })

  it('never overlaps two people in the same row', async () => {
    const layout = await layoutTree(HOLLIS, elk)
    const byRow = new Map<number, number[]>()
    for (const p of layout.positions.values()) byRow.set(p.y, [...(byRow.get(p.y) ?? []), p.x])
    for (const xs of byRow.values()) {
      const sorted = [...xs].sort((a, b) => a - b)
      sorted.slice(1).forEach((x, i) => expect(x - sorted[i]).toBeGreaterThanOrEqual(NODE_W))
    }
  })

  it('handles an empty tree', async () => {
    const layout = await layoutTree({ people: [], families: [] }, elk)
    expect(layout.positions.size).toBe(0)
  })
})

describe('treeLines', () => {
  const elk = new ELK()

  it('joins side-by-side partners at tile height and marks a divorce', async () => {
    const layout = await layoutTree(HOLLIS, elk)
    const lines = treeLines(HOLLIS, layout)
    const couple = lines.find((l) => l.key === 'couple:ellie-marco')!
    expect(couple.status).toBe('divorced')
    expect(couple.marks).toHaveLength(2)
    const [start, end] = couple.paths[0]
    expect(start.y).toBe(layout.positions.get('ellie')!.y + TILE / 2)
    expect(start.y).toBe(end.y)
  })

  it('drops a line from a single parent to each child', async () => {
    const layout = await layoutTree(HOLLIS, elk)
    const lines = treeLines(HOLLIS, layout)
    const graces = lines.find((l) => l.key === 'children:david')!
    expect(graces.title).toBe('Parent and child')
    expect(graces.childPaths).toHaveLength(1)
    expect(graces.childPaths[0].path.at(-1)).toEqual({
      x: layout.positions.get('grace')!.x + NODE_W / 2,
      y: layout.positions.get('grace')!.y,
    })
  })

  it('runs a step-parent’s line from them to their partner’s children', async () => {
    const layout = await layoutTree(HOLLIS, elk)
    const lines = treeLines(HOLLIS, layout)
    const steps = lines.filter((l) => l.kind === 'step')
    expect(steps.map((l) => l.key)).toEqual(['step:susan:david'])
    const [step] = steps
    expect(step.people).toEqual(['susan', 'grace'])
    expect(step.subtitle).toBe('susan → grace')
    const susan = layout.positions.get('susan')!
    const path = step.paths[0]
    expect(path[0]).toEqual({ x: susan.x + NODE_W / 2, y: susan.y + NODE_H })
    // It ends on the line joining David to Grace.
    const joinY = lines.find((l) => l.key === 'children:david')!.childPaths[0].path[0].y
    expect(path.at(-1)!.y).toBe(joinY)
  })

  it('draws no step line once the partner is a parent too', async () => {
    const graph: TreeGraph = {
      people: HOLLIS.people,
      families: [
        ...HOLLIS.families.filter((f) => f.id !== 'david' && f.id !== 'david-susan'),
        family('david-susan', ['david', 'susan'], ['grace'], 'separated'),
      ],
    }
    const lines = treeLines(graph, await layoutTree(graph, elk))
    expect(lines.some((l) => l.kind === 'step')).toBe(false)
    expect(lines.find((l) => l.key === 'children:david-susan')!.title).toBe('Parent and child')
  })
})
