/**
 * Lays out a family tree for the canvas: one generation per row, partners side by side,
 * children centred under their parents, and the lines that join them.
 *
 * Rows are worked out here. ELK's layered layout then orders people within each row and
 * spaces them to keep lines short and uncrossed. Each couple (or single parent) becomes a
 * small joining node on the row below the parents, so partners are pulled together and
 * their children sit beneath them.
 */
import type { ELK, ElkExtendedEdge, ElkNode, LayoutOptions } from 'elkjs/lib/elk-api'
import type { Schemas } from '../api/client'

export type TreeGraph = Schemas['TreeGraphOut']
export type GraphPerson = Schemas['GraphPerson']
export type GraphFamily = Schemas['GraphFamily']
type ChildRelation = Schemas['ChildRelation']
type PartnerStatus = Schemas['PartnerStatus']

/** One person on the canvas: a square tile with the name and years under it. */
export const NODE_W = 140
export const NODE_H = 116
export const TILE = 60
/** Distance between the tops of two rows. */
export const ROW_PITCH = NODE_H + 64

export interface Point {
  x: number
  y: number
}

// ---- rows ------------------------------------------------------------------------------

class Groups {
  private parent = new Map<string, string>()

  find(x: string): string {
    let root = x
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!
    for (let cur = x; cur !== root; ) {
      const next = this.parent.get(cur)!
      this.parent.set(cur, root)
      cur = next
    }
    return root
  }

  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(rb, ra)
  }
}

/**
 * The row (generation) of each person, 0 at the top. Children sit one row below their
 * parents; partners share a row, as do siblings whose parents aren't recorded. Someone with
 * no recorded parents, such as a partner's side of the family, sits just above their own
 * children rather than floating at the top.
 */
export function assignGenerations(graph: TreeGraph): Map<string, number> {
  const groups = new Groups()
  for (const f of graph.families) {
    for (const p of f.partner_ids.slice(1)) groups.union(f.partner_ids[0], p)
    if (f.partner_ids.length === 0) {
      for (const c of f.children.slice(1)) groups.union(f.children[0].person_id, c.person_id)
    }
  }

  const parentsOf = new Map<string, Set<string>>()
  const childrenOf = new Map<string, Set<string>>()
  const link = (from: string, to: string) => {
    if (from === to) return
    if (!childrenOf.has(from)) childrenOf.set(from, new Set())
    if (!parentsOf.has(to)) parentsOf.set(to, new Set())
    childrenOf.get(from)!.add(to)
    parentsOf.get(to)!.add(from)
  }
  for (const f of graph.families) {
    for (const p of f.partner_ids) {
      for (const c of f.children) link(groups.find(p), groups.find(c.person_id))
    }
  }

  const all = new Set(graph.people.map((p) => groups.find(p.id)))
  const row = new Map<string, number>()
  const visiting = new Set<string>()
  const depth = (g: string): number => {
    const known = row.get(g)
    if (known !== undefined) return known
    if (visiting.has(g)) return 0 // the data loops back on itself; stop here
    visiting.add(g)
    let d = 0
    for (const p of parentsOf.get(g) ?? []) d = Math.max(d, depth(p) + 1)
    visiting.delete(g)
    row.set(g, d)
    return d
  }
  all.forEach(depth)

  for (const g of all) {
    if (parentsOf.get(g)?.size) continue
    const kids = [...(childrenOf.get(g) ?? [])]
    if (kids.length) row.set(g, Math.max(row.get(g)!, Math.min(...kids.map((k) => row.get(k)!)) - 1))
  }

  const top = Math.min(...[...all].map((g) => row.get(g)!))
  return new Map(graph.people.map((p) => [p.id, row.get(groups.find(p.id))! - top]))
}

// ---- positions -------------------------------------------------------------------------

export interface TreeLayout {
  /** Top-left corner of each person's box. */
  positions: Map<string, Point>
  rows: Map<string, number>
  width: number
  height: number
}

const ELK_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  // Rows come from assignGenerations; ELK only orders and spaces people within them.
  'elk.partitioning.activate': 'true',
  'elk.spacing.nodeNode': '28',
  'elk.layered.spacing.nodeNodeBetweenLayers': '28',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  // Input order breaks ties, so siblings stay in birth order where possible.
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  // One layout for everything keeps each generation on a single row, even across families
  // that aren't connected to each other.
  'elk.separateConnectedComponents': 'false',
}

const birthYear = (p?: GraphPerson) => p?.birth?.date?.year ?? Number.MAX_SAFE_INTEGER

export async function layoutTree(graph: TreeGraph, elk: ELK): Promise<TreeLayout> {
  const rows = assignGenerations(graph)
  if (!graph.people.length) return { positions: new Map(), rows, width: 0, height: 0 }

  const byId = new Map(graph.people.map((p) => [p.id, p]))
  const people = [...graph.people].sort(
    (a, b) =>
      rows.get(a.id)! - rows.get(b.id)! ||
      birthYear(a) - birthYear(b) ||
      a.display_name.localeCompare(b.display_name),
  )
  const familyRow = (f: GraphFamily) =>
    f.partner_ids.length
      ? rows.get(f.partner_ids[0])!
      : Math.min(...f.children.map((c) => rows.get(c.person_id)!)) - 1

  // People on even partitions, each couple's joining node on the odd partition below them.
  const partitions = new Map<string, number>([
    ...people.map((p): [string, number] => [`p:${p.id}`, 2 * rows.get(p.id)!]),
    ...graph.families.map((f): [string, number] => [`f:${f.id}`, 2 * familyRow(f) + 1]),
  ])
  const offset = -Math.min(0, ...partitions.values())
  const inPartition = (id: string): LayoutOptions => ({
    'elk.partitioning.partition': String(partitions.get(id)! + offset),
  })

  const children: ElkNode[] = [
    ...people.map((p) => ({ id: `p:${p.id}`, width: NODE_W, height: NODE_H, layoutOptions: inPartition(`p:${p.id}`) })),
    ...graph.families.map((f) => ({ id: `f:${f.id}`, width: 2, height: 2, layoutOptions: inPartition(`f:${f.id}`) })),
  ]
  const edges: ElkExtendedEdge[] = []
  for (const f of graph.families) {
    for (const p of f.partner_ids) {
      edges.push({ id: `pf:${p}:${f.id}`, sources: [`p:${p}`], targets: [`f:${f.id}`] })
    }
    const kids = [...f.children].sort((a, b) => birthYear(byId.get(a.person_id)) - birthYear(byId.get(b.person_id)))
    for (const c of kids) {
      edges.push({ id: `fc:${f.id}:${c.person_id}`, sources: [`f:${f.id}`], targets: [`p:${c.person_id}`] })
    }
  }

  const result = await elk.layout({ id: 'root', layoutOptions: ELK_OPTIONS, children, edges })
  const positions = new Map<string, Point>()
  let width = 0
  for (const node of result.children ?? []) {
    if (!node.id.startsWith('p:')) continue
    const id = node.id.slice(2)
    // Snap every row to the same grid so generations line up across the whole tree.
    const pos = { x: Math.round(node.x ?? 0), y: rows.get(id)! * ROW_PITCH }
    positions.set(id, pos)
    width = Math.max(width, pos.x + NODE_W)
  }
  const height = (Math.max(...rows.values()) + 1) * ROW_PITCH - (ROW_PITCH - NODE_H)
  return { positions, rows, width, height }
}

// ---- lines -----------------------------------------------------------------------------

export interface ChildPath {
  path: Point[]
  relation: ChildRelation
  childId: string
}

export interface TreeLine {
  key: string
  familyId: string
  /** A couple; their children; or a step-parent's dotted line to their partner's children. */
  kind: 'couple' | 'children' | 'step'
  /** Solid or dashed polylines, depending on the couple's status. */
  paths: Point[][]
  /** The drop to each child, drawn differently for adopted, foster and step children. */
  childPaths: ChildPath[]
  status: PartnerStatus
  /** Two short slashes across a divorced couple's line. */
  marks: Point[][]
  /** Everyone the line connects, for highlighting. */
  people: string[]
  /** Where the line's label appears. */
  anchor: Point
  title: string
  subtitle: string
}

const STATUS_TITLE: Record<PartnerStatus, string> = {
  together: 'Partners',
  separated: 'Separated',
  divorced: 'Divorced',
}

export function treeLines(graph: TreeGraph, layout: TreeLayout): TreeLine[] {
  const { positions } = layout
  const name = new Map(graph.people.map((p) => [p.id, p.display_name]))
  const centre = (id: string): Point => {
    const p = positions.get(id)!
    return { x: p.x + NODE_W / 2, y: p.y + TILE / 2 }
  }
  const top = (id: string): Point => ({ x: positions.get(id)!.x + NODE_W / 2, y: positions.get(id)!.y })
  const bottom = (id: string): Point => ({ x: top(id).x, y: positions.get(id)!.y + NODE_H })
  const lines: TreeLine[] = []
  // Where each family's joining line to its children runs, for step-parents' lines to meet.
  const joins = new Map<string, { y: number; from: number; to: number }>()

  for (const f of graph.families) {
    const partners = f.partner_ids.filter((p) => positions.has(p)).sort((a, b) => positions.get(a)!.x - positions.get(b)!.x)
    const kids = f.children.filter((c) => positions.has(c.person_id))
    let stem: Point | null = null

    if (partners.length >= 2) {
      const [a, b] = partners
      const A = centre(a)
      const B = centre(b)
      const sameRow = A.y === B.y
      const someoneBetween =
        sameRow &&
        [...positions].some(([id, p]) => id !== a && id !== b && p.y === positions.get(a)!.y && p.x + NODE_W / 2 > A.x && p.x + NODE_W / 2 < B.x)
      let path: Point[]
      if (sameRow && !someoneBetween) {
        path = [{ x: A.x + TILE / 2, y: A.y }, { x: B.x - TILE / 2, y: B.y }]
        stem = { x: (A.x + B.x) / 2, y: A.y }
      } else {
        // Partners who aren't side by side are joined underneath instead.
        const barY = Math.max(bottom(a).y, bottom(b).y) + 12
        path = [bottom(a), { x: A.x, y: barY }, { x: B.x, y: barY }, bottom(b)]
        stem = { x: (A.x + B.x) / 2, y: barY }
      }
      const mid = stem
      const marks =
        f.status === 'divorced'
          ? [-4, 4].map((d) => [
              { x: mid.x + d - 4, y: mid.y + 7 },
              { x: mid.x + d + 4, y: mid.y - 7 },
            ])
          : []
      const married = f.status === 'together' && f.marriage
      const when = f.marriage?.short ? (married ? ` · ${f.marriage.short}` : ` · married ${f.marriage.short}`) : ''
      lines.push({
        key: `couple:${f.id}`,
        familyId: f.id,
        kind: 'couple',
        paths: [path],
        childPaths: [],
        status: f.status,
        marks,
        people: [a, b],
        anchor: { x: mid.x, y: mid.y - 16 },
        title: married ? 'Married' : STATUS_TITLE[f.status],
        subtitle: `${name.get(a)} & ${name.get(b)}${when}`,
      })
    } else if (partners.length === 1) {
      stem = bottom(partners[0])
    }

    if (!kids.length) continue
    const tops = kids.map((c) => top(c.person_id))
    const busY = Math.min(...tops.map((t) => t.y)) - 22
    const xs = [...tops.map((t) => t.x), ...(stem ? [stem.x] : [])]
    const paths: Point[][] = []
    joins.set(f.id, { y: busY, from: Math.min(...xs), to: Math.max(...xs) })
    if (stem) paths.push([stem, { x: stem.x, y: busY }])
    if (Math.min(...xs) < Math.max(...xs)) {
      paths.push([{ x: Math.min(...xs), y: busY }, { x: Math.max(...xs), y: busY }])
    }
    const parentNames = partners.map((p) => name.get(p)).join(' & ')
    const kidNames = kids.map((c) => name.get(c.person_id)).join(', ')
    lines.push({
      key: `children:${f.id}`,
      familyId: f.id,
      kind: 'children',
      paths,
      childPaths: kids.map((c, i) => ({
        path: [{ x: tops[i].x, y: busY }, tops[i]],
        relation: c.relation,
        childId: c.person_id,
      })),
      status: f.status,
      marks: [],
      people: [...partners, ...kids.map((c) => c.person_id)],
      anchor: { x: stem?.x ?? (Math.min(...xs) + Math.max(...xs)) / 2, y: busY - 6 },
      title: !partners.length ? 'Siblings' : kids.length > 1 ? 'Parents and children' : 'Parent and child',
      subtitle: partners.length ? `${parentNames} → ${kidNames}` : kidNames,
    })
  }

  lines.push(...stepLines(graph, positions, joins, bottom, name))
  return lines
}

/**
 * A parent's partner who isn't a parent themselves is a step-parent (as in app/kinship.py),
 * whether the couple is together or not. Each gets a dotted line from them to the children's
 * joining line, running just above it so it never lies along another family's line.
 */
function stepLines(
  graph: TreeGraph,
  positions: Map<string, Point>,
  joins: Map<string, { y: number; from: number; to: number }>,
  bottom: (id: string) => Point,
  name: Map<string, string>,
): TreeLine[] {
  const parentsOf = new Map<string, Set<string>>()
  const partnersOf = new Map<string, { id: string; status: PartnerStatus }[]>()
  for (const f of graph.families) {
    for (const c of f.children) {
      if (c.relation === 'step') continue
      if (!parentsOf.has(c.person_id)) parentsOf.set(c.person_id, new Set())
      f.partner_ids.forEach((p) => parentsOf.get(c.person_id)!.add(p))
    }
    for (const a of f.partner_ids) {
      for (const b of f.partner_ids) {
        if (a !== b) partnersOf.set(a, [...(partnersOf.get(a) ?? []), { id: b, status: f.status }])
      }
    }
  }

  const lines: TreeLine[] = []
  for (const f of graph.families) {
    const join = joins.get(f.id)
    if (!join) continue
    const steps = new Map<string, PartnerStatus>()
    for (const parent of f.partner_ids) {
      for (const q of partnersOf.get(parent) ?? []) {
        if (!f.partner_ids.includes(q.id) && positions.has(q.id) && !steps.has(q.id)) steps.set(q.id, q.status)
      }
    }
    for (const [step, status] of steps) {
      const kids = f.children
        .map((c) => c.person_id)
        .filter((k) => k !== step && positions.has(k) && !parentsOf.get(k)?.has(step))
      const start = bottom(step)
      if (!kids.length || start.y >= join.y) continue
      // Down, then across to the nearest end of the joining line, just above it.
      const x = Math.min(Math.max(start.x, join.from), join.to)
      const y = join.y - 10
      const path =
        x === start.x ? [start, { x, y: join.y }] : [start, { x: start.x, y }, { x, y }, { x, y: join.y }]
      lines.push({
        key: `step:${step}:${f.id}`,
        familyId: f.id,
        kind: 'step',
        paths: [path],
        childPaths: [],
        status,
        marks: [],
        people: [step, ...kids],
        anchor: { x: (start.x + x) / 2, y: y - 6 },
        title: 'Step-parent',
        subtitle: `${name.get(step)} → ${kids.map((k) => name.get(k)).join(', ')}`,
      })
    }
  }
  return lines
}

// ---- a line between two people -------------------------------------------------------------

/** A piece of line to draw lit, styled like the line it lies along. */
export interface LitSegment {
  points: Point[]
  /** Extra classes, such as "broken" for a separated couple or "rel-adopted" for a drop. */
  style: string
}

/**
 * Exactly the pieces of line a chain of people runs along, one step at a time: the line
 * between partners, and from a parent down to one child (or across between siblings recorded
 * without parents) only as far as that child, not along to the others.
 */
export function pathSegments(lines: TreeLine[], ids: string[]): LitSegment[] {
  const out: LitSegment[] = []
  for (let i = 1; i < ids.length; i++) {
    const [a, b] = [ids[i - 1], ids[i]]
    const couple = lines.find((l) => l.kind === 'couple' && l.people.includes(a) && l.people.includes(b))
    if (couple) {
      const style = couple.status === 'together' ? '' : ' broken'
      couple.paths.forEach((points) => out.push({ points, style }))
      couple.marks.forEach((points) => out.push({ points, style: '' }))
      continue
    }
    for (const line of lines) {
      if (line.kind !== 'children') continue
      const drops = new Map(line.childPaths.map((c) => [c.childId, c]))
      const parents = line.people.filter((p) => !drops.has(p))
      const drop = (id: string) => {
        const c = drops.get(id)!
        out.push({ points: c.path, style: ` rel-${c.relation}` })
        return c.path[0]
      }
      const across = (from: Point, to: Point) => {
        if (from.x !== to.x) out.push({ points: [from, { x: to.x, y: from.y }], style: '' })
      }
      if ((parents.includes(a) && drops.has(b)) || (parents.includes(b) && drops.has(a))) {
        // Along the couple's line from this parent to where the stem starts between them,
        // down the stem, then across to this child only.
        const parent = parents.includes(a) ? a : b
        const stem = line.paths[0]
        const couple = lines.find((l) => l.kind === 'couple' && parents.every((p) => l.people.includes(p)))
        if (couple && parents.length === 2) {
          const half = halfTowards(couple.paths[0], stem[0], parent === couple.people[0])
          if (half) out.push({ points: half, style: couple.status === 'together' ? '' : ' broken' })
        }
        out.push({ points: stem, style: '' })
        across(stem.at(-1)!, drop(drops.has(a) ? a : b))
      } else if (!parents.length && drops.has(a) && drops.has(b)) {
        across(drop(a), drop(b))
      }
    }
  }
  return out
}

/**
 * The part of a couple's line from one partner's end to `mid`, the point between them where
 * their children's stem begins. The line runs from the first partner to the second.
 */
function halfTowards(line: Point[], mid: Point, first: boolean): Point[] | null {
  for (let i = 0; i + 1 < line.length; i++) {
    const [p, q] = [line[i], line[i + 1]]
    const onSegment =
      p.y === q.y && mid.y === p.y && Math.min(p.x, q.x) <= mid.x && mid.x <= Math.max(p.x, q.x)
    if (onSegment) return first ? [...line.slice(0, i + 1), mid] : [mid, ...line.slice(i + 1)]
  }
  return null
}

