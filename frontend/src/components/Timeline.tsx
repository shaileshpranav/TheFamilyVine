import { PencilSimple, Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import type { PersonDetail } from '../api/client'
import type { EventType } from '../lib/genealogy'
import EventForm, { type EventOwner } from './EventForm'
import { Label, Tag } from './ui'

export interface Couple {
  familyId: string
  partnerName: string
}

/** A person's life in date order, with inline adding and editing of events. */
export default function Timeline({
  treeId,
  person,
  couples,
  adding,
  onAddingChange,
}: {
  treeId: string
  person: PersonDetail
  /** Couples whose shared events the viewer may edit. */
  couples: Couple[]
  /** A preset event type when opened from elsewhere (e.g. "Add birth date"). */
  adding: EventType | 'any' | null
  onAddingChange: (value: EventType | 'any' | null) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [ownerKey, setOwnerKey] = useState('person')
  const canAdd = person.permissions.can_edit || couples.length > 0
  const recorded = person.timeline.filter((i) => i.kind === 'person').map((i) => i.type)

  // Who a new event belongs to: this person, or one of their couples.
  const options: { key: string; label: string; owner: EventOwner }[] = []
  if (person.permissions.can_edit) {
    options.push({
      key: 'person',
      label: person.given_names || person.display_name,
      owner: { kind: 'person', personId: person.id, name: person.display_name },
    })
  }
  for (const c of couples) {
    options.push({
      key: c.familyId,
      label: `With ${c.partnerName}`,
      owner: {
        kind: 'family',
        familyId: c.familyId,
        name: `${person.given_names || person.display_name} and ${c.partnerName}`,
      },
    })
  }
  const chosen = options.find((o) => o.key === ownerKey) ?? options[0]
  const personOption = options.find((o) => o.key === 'person')

  return (
    <section className="card">
      <div className="section-head">
        <Label>Timeline</Label>
        {canAdd && !adding && (
          <button className="btn btn-ghost btn-sm" onClick={() => onAddingChange('any')}>
            <Plus size={14} /> Add event
          </button>
        )}
      </div>

      {adding && chosen && (
        <div className="stack" style={{ marginBottom: 20 }}>
          {options.length > 1 && adding === 'any' && (
            <div className="seg" role="radiogroup" aria-label="Whose event">
              {options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={o.key === chosen.key}
                  className={`seg-opt${o.key === chosen.key ? ' on' : ''}`}
                  onClick={() => setOwnerKey(o.key)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          <EventForm
            key={`${adding}-${chosen.key}`}
            treeId={treeId}
            owner={adding === 'any' ? chosen.owner : (personOption ?? chosen).owner}
            presetType={adding === 'any' ? undefined : adding}
            recorded={recorded}
            onDone={() => onAddingChange(null)}
          />
        </div>
      )}

      {person.timeline.length === 0 ? (
        <p className="muted small">
          Nothing recorded yet.{canAdd ? ' Add a birth, a move, a marriage or anything else that mattered.' : ''}
        </p>
      ) : (
        <ol className="timeline">
          {person.timeline.map((item) =>
            editing === item.key ? (
              <li key={item.key}>
                <EventForm
                  treeId={treeId}
                  owner={
                    item.kind === 'family' && item.family_id
                      ? {
                          kind: 'family',
                          familyId: item.family_id,
                          name: couples.find((c) => c.familyId === item.family_id)?.partnerName ?? 'this couple',
                        }
                      : { kind: 'person', personId: person.id, name: person.display_name }
                  }
                  item={item}
                  recorded={recorded}
                  onDone={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={item.key} className="tl-row">
                <span className="tl-year mono">{item.date?.short || '—'}</span>
                <div className="grow">
                  <div className="tl-summary">
                    {item.summary}
                    {item.title && item.type !== 'other' && <Tag>{item.type_label}</Tag>}
                  </div>
                  {(() => {
                    // A year-only date already shows in the year column.
                    const when = item.date && item.date.label !== item.date.short ? item.date.label : null
                    const sub = [when, item.place].filter(Boolean).join(' · ')
                    return sub ? <div className="row-sub">{sub}</div> : null
                  })()}
                  {item.description && <p className="tl-desc prewrap">{item.description}</p>}
                </div>
                {item.editable && item.event_id && (
                  <button
                    className="btn btn-ghost btn-sm btn-icon"
                    aria-label={`Edit “${item.summary}”`}
                    title="Edit"
                    onClick={() => setEditing(item.key)}
                  >
                    <PencilSimple size={15} />
                  </button>
                )}
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  )
}
