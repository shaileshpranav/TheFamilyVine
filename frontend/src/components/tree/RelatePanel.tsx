import { ArrowsDownUp, X } from '@phosphor-icons/react'
import { capitalise, type Kin } from '../../lib/relationship'
import type { GraphPerson } from '../../lib/treeLayout'
import PersonPicker from '../PersonPicker'
import { Avatar, Label } from '../ui'

export interface RelatePick {
  from: string | null
  to: string | null
}

/** "How are we related?": pick two people to see what one is to the other, and the line between. */
export default function RelatePanel({
  kin,
  people,
  meId,
  pick,
  onPick,
  onShow,
  onClose,
}: {
  kin: Kin | null
  people: GraphPerson[]
  meId: string | null
  pick: RelatePick
  onPick: (pick: RelatePick) => void
  /** Light up the chain on the canvas, with a sentence saying what it shows. */
  onShow: (ids: string[], summary: string) => void
  onClose: () => void
}) {
  const byId = new Map(people.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.display_name ?? 'Unknown'
  const firstName = (id: string) => byId.get(id)?.given_names || name(id)
  const { from, to } = pick
  const rel = kin && from && to ? kin.relate(from, to) : null
  const whose = from === meId ? 'your' : `${from ? name(from) : ''}’s`
  const lead =
    !rel || !from || !to || rel.kind === 'self'
      ? null
      : rel.kind === 'none'
        ? `${name(to)} and ${name(from)}`
        : `${name(to)} is ${whose}`

  return (
    <aside className="tree-panel relate-panel" aria-label="How are we related?">
      <button type="button" className="btn btn-ghost btn-icon tree-panel-close" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </button>
      <header>
        <h2 className="tree-panel-name">How are we related?</h2>
        <p className="muted small" style={{ marginTop: 4 }}>
          Pick two people and the tree traces the line between them.
        </p>
      </header>

      <div className="relate-picks">
        <div className="field">
          <span className="field-label">From</span>
          <PersonPicker
            people={people}
            value={from}
            onChange={(id) => onPick({ from: id, to })}
            label="Search for the first person"
            autoFocus={!from}
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm relate-swap"
          disabled={!from && !to}
          onClick={() => onPick({ from: to, to: from })}
        >
          <ArrowsDownUp size={15} /> Swap
        </button>
        <div className="field">
          <span className="field-label">To</span>
          <PersonPicker
            people={people}
            value={to}
            onChange={(id) => onPick({ from, to: id })}
            label="Search for the second person"
            autoFocus={!!from && !to}
          />
        </div>
      </div>

      {rel && (
        <div className={`relate-result${rel.kind === 'none' ? ' none' : ''}`} role="status">
          {lead && <p className="relate-lead">{lead}</p>}
          <p className="relate-title">{rel.title}</p>
          {rel.detail && <p className="muted small">{rel.detail}</p>}
        </div>
      )}

      {rel && rel.path.length > 1 && (
        <section className="tree-panel-section">
          <Label>The connection</Label>
          <ol className="plain relate-chain">
            {rel.path.map((step, i) => (
              <li key={step.id}>
                <Avatar
                  name={name(step.id)}
                  size="sm"
                  me={step.id === meId}
                  deceased={byId.get(step.id)?.is_living === false}
                />
                <span className="grow">
                  <span className="rel-name">{name(step.id)}</span>
                  <span className="rel-sub">
                    {i === 0
                      ? step.id === meId
                        ? 'You'
                        : 'From here'
                      : `${capitalise(step.role ?? 'relative')} of ${firstName(rel.path[i - 1].id)}`}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn"
            onClick={() => onShow(rel.path.map((s) => s.id), `${lead} ${rel.title.charAt(0).toLowerCase()}${rel.title.slice(1)}`)}
          >
            Show this line on the tree
          </button>
        </section>
      )}
    </aside>
  )
}
