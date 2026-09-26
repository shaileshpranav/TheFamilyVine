import { Cake, Flower, Heart } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { type Occasion, occasions, ordinal } from '../lib/occasions'
import { type Kin, relationToYou } from '../lib/relationship'
import type { TreeGraph } from '../lib/treeLayout'
import { Label } from './ui'

const ICON = { birthday: Cake, anniversary: Heart, memorial: Flower }
const WEEKDAY = new Intl.DateTimeFormat('en', { weekday: 'long' })

/** Birthdays, wedding anniversaries and memorials today and in the week ahead. */
export default function OnThisDay({ graph, kin, meId }: { graph: TreeGraph; kin: Kin | null; meId: string | null }) {
  const byId = new Map(graph.people.map((p) => [p.id, p]))
  const first = (id: string) => byId.get(id)?.given_names || byId.get(id)?.display_name || 'Someone'
  const items = occasions(graph)

  const when = (o: Occasion) => {
    if (o.inDays === 0) return 'Today'
    if (o.inDays === 1) return 'Tomorrow'
    const day = new Date()
    day.setDate(day.getDate() + o.inDays)
    return WEEKDAY.format(day)
  }
  const text = (o: Occasion) => {
    const [a, b] = o.people.map(first)
    const today = o.inDays === 0
    switch (o.kind) {
      case 'birthday':
        return `${a} turns ${o.years}${today ? ' today' : ''}`
      case 'anniversary':
        return today ? `${a} and ${b} were married ${o.years} years ago today` : `${a} and ${b}’s ${ordinal(o.years)} wedding anniversary`
      case 'memorial':
        return today ? `${a} died ${o.years} years ago today` : `${o.years} years since ${a} died`
    }
  }
  const detail = (o: Occasion) => {
    const who = o.people.length === 1 && meId && kin ? relationToYou(kin.relate(meId, o.people[0])) : null
    const since = o.kind === 'birthday' ? `born ${o.since}` : o.kind === 'anniversary' ? `married ${o.since}` : `died ${o.since}`
    return who && who !== 'You' ? `${who} · ${since}` : since.charAt(0).toUpperCase() + since.slice(1)
  }

  return (
    <section className="card" style={{ height: '100%' }}>
      <Label>On this day</Label>
      {items.length === 0 ? (
        <p className="muted small">
          Nothing in the week ahead. Birthdays, weddings and memorials with a full date appear here.
        </p>
      ) : (
        <ul className="plain occasions">
          {items.map((o) => {
            const Icon = ICON[o.kind]
            return (
              <li key={o.key}>
                <Link to={`people/${o.people[0]}`} className="occasion">
                  <span className={`occasion-icon ${o.kind}`} aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <span className="grow">
                    <span className="occasion-when">{when(o)}</span>
                    <span className="occasion-text">{text(o)}</span>
                    <span className="rel-sub">{detail(o)}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
