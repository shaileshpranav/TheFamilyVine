/**
 * How two people on the tree are related, in words, with the chain of people between them.
 *
 * Works from the tree graph, which holds only the people the viewer may see, so nobody hidden
 * is used to connect them. Blood relatives are named through their nearest shared ancestors
 * ("second cousin twice removed"), with "half-" when they share one parent's line only. Then
 * come partners, step relatives and in-laws, and anything further reads as a chain ("Aunt's
 * husband's sister").
 */
import type { GraphFamily, GraphPerson, TreeGraph } from './treeLayout'

type Sex = GraphPerson['sex']

export interface PathStep {
  id: string
  /** What this person is to the one before them in the chain: "mother", "son", "husband"… */
  role: string | null
}

export interface Relationship {
  kind: 'self' | 'partner' | 'blood' | 'step' | 'in_law' | 'chain' | 'none'
  /** What `to` is to `from`: "First cousin once removed", "Mother-in-law"… */
  title: string
  /** Who connects them, when that helps: "Through Arthur Lane and Beatrice Lane". */
  detail: string | null
  /** From `from` to `to`, both included. Empty when they aren't connected. */
  path: PathStep[]
}

const NOT_RELATED: Relationship = { kind: 'none', title: 'Not related on this tree', detail: null, path: [] }

// ---- words ---------------------------------------------------------------------------------

/** The female, male or neutral form, by the person's recorded sex. */
const bySex = (sex: Sex, female: string, male: string, neutral: string) =>
  sex === 'female' ? female : sex === 'male' ? male : neutral

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
const TIMES = ['', 'once', 'twice', 'three times', 'four times', 'five times', 'six times', 'seven times']

/** "", "great-", "great-great-", then "3× great-". */
const greats = (n: number) => (n <= 0 ? '' : n <= 2 ? 'great-'.repeat(n) : `${n}× great-`)

/**
 * A blood relation, for someone `db` generations below a shared ancestor as seen from someone
 * `da` generations below it. Lower case: "great-aunt", "second cousin once removed".
 */
export function bloodTerm(da: number, db: number, sex: Sex, half = false): string {
  const h = half ? 'half-' : ''
  if (db === 0) {
    if (da === 1) return bySex(sex, 'mother', 'father', 'parent')
    const g = greats(da - 2)
    return bySex(sex, `${g}grandmother`, `${g}grandfather`, `${g}grandparent`)
  }
  if (da === 0) {
    if (db === 1) return bySex(sex, 'daughter', 'son', 'child')
    const g = greats(db - 2)
    return bySex(sex, `${g}granddaughter`, `${g}grandson`, `${g}grandchild`)
  }
  if (da === 1 && db === 1) return h + bySex(sex, 'sister', 'brother', 'sibling')
  if (da === 1) {
    const g = greats(db - 2)
    return h + bySex(sex, `${g}niece`, `${g}nephew`, `${g}niece or ${g}nephew`)
  }
  if (db === 1) {
    const g = greats(da - 2)
    return h + bySex(sex, `${g}aunt`, `${g}uncle`, `${g}aunt or ${g}uncle`)
  }
  const degree = Math.min(da, db) - 1
  const removed = Math.abs(da - db)
  const cousin = `${ORDINALS[degree - 1] ?? `${degree}th`} cousin`
  return `${half ? 'half ' : ''}${cousin}${removed ? ` ${TIMES[removed] ?? `${removed} times`} removed` : ''}`
}

/** "wife", "former husband", "partner"… Married couples stay married while separated. */
export function spouseTerm(family: GraphFamily, sex: Sex): string {
  if (family.married) {
    const spouse = bySex(sex, 'wife', 'husband', 'spouse')
    return family.status === 'divorced' ? `former ${spouse}` : spouse
  }
  return family.status === 'together' ? 'partner' : 'former partner'
}

const names = (list: string[]) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`)

// ---- the family graph ----------------------------------------------------------------------

/** A person, or `f:<id>` for a family's parents, recorded or not, as one shared ancestor. */
type Node = string

interface Up {
  gen: number
  /** The person a generation below, on the way back to where the search began. */
  below: string | null
}

interface Blood {
  term: string
  detail: string | null
  path: string[]
  da: number
  db: number
}

export class Kin {
  private people: Map<string, GraphPerson>
  private families: Map<string, GraphFamily>
  /** Families each person was born into or adopted by (not step links). */
  private birth = new Map<string, GraphFamily[]>()
  /** Families each person is a partner in, single parents included. */
  private partnerIn = new Map<string, GraphFamily[]>()
  /** Families that took each person in as a step-child. */
  private stepIn = new Map<string, GraphFamily[]>()
  private ups = new Map<string, Map<Node, Up>>()
  private walks = new Map<string, Map<string, string | null>>()

  constructor(graph: TreeGraph) {
    this.people = new Map(graph.people.map((p) => [p.id, p]))
    this.families = new Map(graph.families.map((f) => [f.id, f]))
    const add = (map: Map<string, GraphFamily[]>, id: string, f: GraphFamily) => map.set(id, [...(map.get(id) ?? []), f])
    for (const f of graph.families) {
      for (const c of f.children) add(c.relation === 'step' ? this.stepIn : this.birth, c.person_id, f)
      for (const p of f.partner_ids) add(this.partnerIn, p, f)
    }
  }

  has(id: string) {
    return this.people.has(id)
  }
  private sex(id: string): Sex {
    return this.people.get(id)?.sex ?? 'unknown'
  }
  private name(id: string) {
    return this.people.get(id)?.display_name ?? 'Unknown'
  }
  private parents(id: string) {
    return (this.birth.get(id) ?? []).flatMap((f) => f.partner_ids)
  }
  private children(id: string) {
    return (this.partnerIn.get(id) ?? []).flatMap((f) =>
      f.children.filter((c) => c.relation !== 'step').map((c) => c.person_id),
    )
  }
  private partners(id: string) {
    return (this.partnerIn.get(id) ?? []).flatMap((family) =>
      family.partner_ids.filter((p) => p !== id).map((p) => ({ id: p, family })),
    )
  }
  private couple(a: string, b: string) {
    return this.partnerIn.get(a)?.find((f) => f.partner_ids.includes(b))
  }
  /** Siblings recorded without parents, who are linked only through their shared family. */
  private parentlessSiblings(id: string) {
    return (this.birth.get(id) ?? [])
      .filter((f) => !f.partner_ids.length)
      .flatMap((f) => f.children.map((c) => c.person_id))
      .filter((c) => c !== id)
  }
  private stepParentLinks(id: string) {
    return (this.stepIn.get(id) ?? []).flatMap((f) => f.partner_ids)
  }

  /** Everyone above a person, by generation: parents, and each family as their shared parents. */
  private up(start: string): Map<Node, Up> {
    const known = this.ups.get(start)
    if (known) return known
    const seen = new Map<Node, Up>([[start, { gen: 0, below: null }]])
    let frontier = [start]
    for (let gen = 1; frontier.length; gen++) {
      const next: string[] = []
      for (const person of frontier) {
        for (const f of this.birth.get(person) ?? []) {
          if (!seen.has(`f:${f.id}`)) seen.set(`f:${f.id}`, { gen, below: person })
          for (const parent of f.partner_ids) {
            if (seen.has(parent)) continue
            seen.set(parent, { gen, below: person })
            next.push(parent)
          }
        }
      }
      frontier = next
    }
    this.ups.set(start, seen)
    return seen
  }

  /** The people from where a search began up to just below `node`. */
  private climb(up: Map<Node, Up>, node: Node): string[] {
    const out: string[] = []
    for (let cur = up.get(node)!.below; cur !== null; cur = up.get(cur)!.below) out.push(cur)
    return out.reverse()
  }

  /** `b` as `a`'s blood relative, through their nearest shared ancestors. */
  private blood(a: string, b: string): Blood | null {
    const ua = this.up(a)
    const ub = this.up(b)
    let best: { node: Node; da: number; db: number } | null = null
    for (const [node, x] of ua) {
      const y = ub.get(node)
      if (!y) continue
      const sum = x.gen + y.gen
      const bestSum = best ? best.da + best.db : Infinity
      // A shared family (the same set of parents) beats one shared parent: full, not half.
      if (sum < bestSum || (sum === bestSum && node.startsWith('f:') && !best!.node.startsWith('f:'))) {
        best = { node, da: x.gen, db: y.gen }
      }
    }
    if (!best) return null
    const { node, da, db } = best
    const family = node.startsWith('f:') ? this.families.get(node.slice(2))! : null
    const direct = da === 0 || db === 0
    const top = family ? family.partner_ids.slice(0, 1) : [node]
    const path = [...this.climb(ua, node), ...top, ...this.climb(ub, node).reverse()]
    const through = family ? family.partner_ids.map((p) => this.name(p)) : [this.name(node)]
    const detail =
      direct || !through.length
        ? null
        : da === 1 && db === 1 && family
          ? `Both children of ${names(through)}`
          : `Through ${names(through)}`
    return { term: bloodTerm(da, db, this.sex(b), !family && !direct), detail, path, da, db }
  }

  /** What each person in a chain is to the one before them. */
  private steps(ids: string[]): PathStep[] {
    return ids.map((id, i) => {
      if (i === 0) return { id, role: null }
      const prev = ids[i - 1]
      const sex = this.sex(id)
      const couple = this.couple(prev, id)
      const role = this.parents(prev).includes(id)
        ? bloodTerm(1, 0, sex)
        : this.parents(id).includes(prev)
          ? bloodTerm(0, 1, sex)
          : couple
            ? spouseTerm(couple, sex)
            : this.parentlessSiblings(prev).includes(id)
              ? bloodTerm(1, 1, sex)
              : this.stepParentLinks(prev).includes(id)
                ? `step-${bloodTerm(1, 0, sex)}`
                : this.stepParentLinks(id).includes(prev)
                  ? `step-${bloodTerm(0, 1, sex)}`
                  : 'relative'
      return { id, role }
    })
  }

  private named(kind: Relationship['kind'], term: string, detail: string | null, ids: string[]): Relationship {
    return { kind, title: capitalise(term), detail, path: this.steps(ids) }
  }

  /** What `to` is to `from`. */
  relate(from: string, to: string): Relationship {
    if (!this.has(from) || !this.has(to)) return NOT_RELATED
    if (from === to) return { kind: 'self', title: 'The same person', detail: null, path: this.steps([from]) }
    const couple = this.couple(from, to)
    if (couple) {
      const when = couple.marriage?.short ? `Married ${couple.marriage.short}` : null
      return this.named('partner', spouseTerm(couple, this.sex(to)), when, [from, to])
    }
    const blood = this.blood(from, to)
    if (blood) return this.named('blood', blood.term, blood.detail, blood.path)
    return this.step(from, to) ?? this.inLaw(from, to) ?? this.chained(from, to) ?? NOT_RELATED
  }

  private step(a: string, b: string): Relationship | null {
    const sex = this.sex(b)
    const stepParent = (child: string, parent: string) => {
      // A partner of the child's parent who isn't a parent of theirs, or an explicit step link.
      for (const p of this.parents(child)) {
        if (this.couple(p, parent) && !this.parents(child).includes(parent)) return [child, p, parent]
      }
      return this.stepParentLinks(child).includes(parent) ? [child, parent] : null
    }
    const stepGrandparent = (child: string, gp: string) => {
      // A grandparent's partner, or a step-parent's parent.
      for (const p of this.parents(child)) {
        const viaGrandparent = stepParent(p, gp)
        if (viaGrandparent) return [child, ...viaGrandparent]
      }
      for (const p of this.parents(child)) {
        for (const { id: s } of this.partners(p)) {
          if (!this.parents(child).includes(s) && this.parents(s).includes(gp)) return [child, p, s, gp]
        }
      }
      return null
    }
    const through = (ids: string[]) => (ids.length > 2 ? `Through ${this.name(ids.at(-2)!)}` : null)

    let ids = stepParent(a, b)
    if (ids) return this.named('step', `step-${bloodTerm(1, 0, sex)}`, through(ids), ids)
    ids = stepParent(b, a)
    if (ids) return this.named('step', `step-${bloodTerm(0, 1, sex)}`, ids.length > 2 ? `Through ${this.name(ids[1])}` : null, [...ids].reverse())
    // A step-parent's child who isn't a sibling.
    for (const p of this.parents(a)) {
      for (const { id: s } of this.partners(p)) {
        if (!this.parents(a).includes(s) && this.parents(b).includes(s)) {
          return this.named('step', `step-${bloodTerm(1, 1, sex)}`, `Through ${this.name(s)}`, [a, p, s, b])
        }
      }
    }
    ids = stepGrandparent(a, b)
    if (ids) return this.named('step', `step-${bloodTerm(2, 0, sex)}`, through(ids), ids)
    ids = stepGrandparent(b, a)
    if (ids) return this.named('step', `step-${bloodTerm(0, 2, sex)}`, null, [...ids].reverse())
    return null
  }

  private inLaw(a: string, b: string): Relationship | null {
    const sex = this.sex(b)
    // b is a blood relative of a's partner.
    for (const { id: q, family } of this.partners(a)) {
      const r = this.blood(q, b)
      if (!r) continue
      const base =
        r.da === 1 && r.db === 0
          ? bloodTerm(1, 0, sex)
          : r.da === 1 && r.db === 1
            ? bloodTerm(1, 1, sex)
            : r.da === 2 && r.db === 0
              ? bloodTerm(2, 0, sex)
              : null
      const term =
        family.married && base
          ? `${family.status === 'divorced' ? 'former ' : ''}${base}-in-law`
          : `${spouseTerm(family, this.sex(q))}’s ${r.term}`
      return this.named('in_law', term, `Through ${this.name(q)}`, [a, ...r.path])
    }
    // b is the partner of a's blood relative.
    for (const { id: r, family } of this.partners(b)) {
      const k = this.blood(a, r)
      if (!k) continue
      const married = family.married && family.status !== 'divorced'
      let term: string | null = null
      let detail = `Through ${this.name(r)}`
      if (married && k.da === 1 && k.db === 1) term = `${bloodTerm(1, 1, sex)}-in-law`
      else if (married && k.da === 0) term = `${bloodTerm(0, k.db, sex)}-in-law`
      else if (married && k.db === 1 && k.da >= 2) {
        // An aunt's husband is an uncle, by marriage.
        term = bloodTerm(k.da, 1, sex)
        detail = `Married to ${this.name(r)}`
      }
      term ??= `${k.term}’s ${spouseTerm(family, sex)}`
      return this.named('in_law', term, detail, [...k.path, b])
    }
    return null
  }

  /** Everyone reachable from a person, one link at a time, with the way back. */
  private walk(start: string) {
    const known = this.walks.get(start)
    if (known) return known
    const prev = new Map<string, string | null>([[start, null]])
    let frontier = [start]
    while (frontier.length) {
      const next: string[] = []
      for (const x of frontier) {
        const links = [
          ...this.parents(x),
          ...this.children(x),
          ...this.partners(x).map((p) => p.id),
          ...this.parentlessSiblings(x),
          ...this.stepParentLinks(x),
          ...(this.partnerIn.get(x) ?? []).flatMap((f) =>
            f.children.filter((c) => c.relation === 'step').map((c) => c.person_id),
          ),
        ]
        for (const y of links) {
          if (prev.has(y)) continue
          prev.set(y, x)
          next.push(y)
        }
      }
      frontier = next
    }
    this.walks.set(start, prev)
    return prev
  }

  /** Anyone else connected: named link by link, splitting at each couple. */
  private chained(a: string, b: string): Relationship | null {
    const prev = this.walk(a)
    if (!prev.has(b)) return null
    const path: string[] = []
    for (let cur: string | null = b; cur !== null; cur = prev.get(cur)!) path.push(cur)
    path.reverse()

    const words: string[] = []
    let start = 0
    const blood = (from: number, to: number) => this.blood(path[from], path[to])?.term ?? null
    for (let i = 1; i < path.length; i++) {
      const couple = this.couple(path[i - 1], path[i])
      if (!couple) continue
      if (i - 1 > start) words.push(blood(start, i - 1) ?? '')
      words.push(spouseTerm(couple, this.sex(path[i])))
      start = i
    }
    if (path.length - 1 > start) words.push(blood(start, path.length - 1) ?? '')
    const title = words.length <= 4 && words.every(Boolean) ? words.join('’s ') : 'related by marriage'
    return this.named('chain', title, null, path)
  }
}

/** "Your first cousin", for labels relative to the viewer. */
export function relationToYou(rel: Relationship): string | null {
  if (rel.kind === 'none') return null
  if (rel.kind === 'self') return 'You'
  return `Your ${rel.title.charAt(0).toLowerCase()}${rel.title.slice(1)}`
}
