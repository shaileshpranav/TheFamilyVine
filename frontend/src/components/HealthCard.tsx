import { Trash } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type Person, type PersonDetail, type Schemas, unwrap } from '../api/client'
import { useConditions, useInvalidateTree } from '../api/hooks'
import { ErrorText, Label, Tag } from './ui'

type Status = Schemas['ConditionStatus']
type Inherited = Schemas['InheritedConditionOut']

const STATUS: Record<Status, { label: string; tone: 'red' | 'blue' | 'yellow' | 'gray' }> = {
  diagnosed: { label: 'Diagnosed', tone: 'red' },
  carrier: { label: 'Carrier', tone: 'blue' },
  watch: { label: 'Watch', tone: 'yellow' },
  untested: { label: 'Untested', tone: 'gray' },
}
const GENERATIONS = ['', 'one generation', 'two generations', 'three generations']

/**
 * "Genetic conditions to watch": what they've recorded, and what close blood relatives have.
 * Only the person and their blood relatives ever see this.
 */
export default function HealthCard({
  treeId,
  person,
  people,
  compact = false,
}: {
  treeId: string
  person: PersonDetail
  people: Map<string, Person>
  /** In the tree's quick view: no adding or changing, just what to watch. */
  compact?: boolean
}) {
  const allowed = person.permissions.can_view_conditions
  const canEdit = person.permissions.can_edit_conditions && !compact
  const { data, error } = useConditions(treeId, person.id, allowed)
  const invalidate = useInvalidateTree()
  const [adding, setAdding] = useState(false)
  const remove = useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/trees/{tree_id}/conditions/{condition_id}', { params: { path: { tree_id: treeId, condition_id: id } } })),
    onSuccess: () => invalidate(treeId),
  })
  const restatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      unwrap(
        api.PATCH('/api/trees/{tree_id}/conditions/{condition_id}', {
          params: { path: { tree_id: treeId, condition_id: id } },
          body: { status },
        }),
      ),
    onSuccess: () => invalidate(treeId),
  })
  if (!allowed) return null

  const first = (id: string) => people.get(id)?.given_names || people.get(id)?.display_name || 'A relative'
  const line = (i: Inherited) => {
    const where =
      i.generations === 0
        ? `From ${first(i.source_id)}, a ${people.get(i.source_id)?.sex === 'male' ? 'brother' : people.get(i.source_id)?.sex === 'female' ? 'sister' : 'sibling'}`
        : i.generations === 1
          ? `From ${first(i.source_id)}`
          : `${i.via.map(first).join(' → ')} · ${GENERATIONS[i.generations] ?? `${i.generations} generations`}`
    return [where, i.status === 'carrier' && 'a carrier', i.others > 0 && `and ${i.others} more`].filter(Boolean).join(' · ')
  }
  const empty = data && !data.recorded.length && !data.inherited.length

  return (
    <section className="card">
      <div className="section-head">
        <Label>Genetic conditions to watch</Label>
        {canEdit && !adding && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            Add a condition
          </button>
        )}
      </div>
      <ErrorText error={error ?? remove.error ?? restatus.error} />
      {adding && <AddCondition treeId={treeId} personId={person.id} onDone={() => setAdding(false)} />}
      {empty && !adding && <p className="muted small">Nothing recorded for {person.given_names || person.display_name}, or passed down from close family.</p>}
      {data && (data.recorded.length > 0 || data.inherited.length > 0) && (
        <ul className="plain conditions">
          {data.recorded.map((c) => (
            <li key={c.id} className="condition">
              <div className="grow">
                <p className="condition-name">{c.name}</p>
                {(c.year || c.note) && (
                  <p className="rel-sub">{[c.year && (c.status === 'diagnosed' ? `Diagnosed ${c.year}` : String(c.year)), c.note].filter(Boolean).join(' · ')}</p>
                )}
              </div>
              {canEdit ? (
                <>
                  <select
                    className="status-select"
                    aria-label={`Status of ${c.name}`}
                    value={c.status}
                    onChange={(e) => restatus.mutate({ id: c.id, status: e.target.value as Status })}
                  >
                    {(Object.keys(STATUS) as Status[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS[s].label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    aria-label={`Remove ${c.name}`}
                    title="Remove"
                    onClick={() => confirm(`Remove ${c.name}?`) && remove.mutate(c.id)}
                  >
                    <Trash size={15} />
                  </button>
                </>
              ) : (
                <Tag tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Tag>
              )}
            </li>
          ))}
          {data.inherited.map((i) => (
            <li key={`inherited-${i.name}`} className="condition">
              <div className="grow">
                <p className="condition-name">{i.name}</p>
                <p className="rel-sub">{line(i)}</p>
              </div>
              <Tag tone="yellow">Watch</Tag>
            </li>
          ))}
        </ul>
      )}
      {data && data.inherited.length > 0 && (
        <p className="muted small condition-note">
          Traced from conditions relatives have recorded on their own profiles. A family pattern, not a diagnosis:
          talk to a doctor.
        </p>
      )}
      {!compact && <p className="muted small condition-note">Only {person.given_names || 'they'} and their blood relatives can see this.</p>}
    </section>
  )
}

function AddCondition({ treeId, personId, onDone }: { treeId: string; personId: string; onDone: () => void }) {
  const invalidate = useInvalidateTree()
  const [form, setForm] = useState({ name: '', status: 'diagnosed' as Status, year: '', note: '' })
  const add = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/trees/{tree_id}/people/{person_id}/conditions', {
          params: { path: { tree_id: treeId, person_id: personId } },
          body: { name: form.name.trim(), status: form.status, year: form.year ? Number(form.year) : null, note: form.note },
        }),
      ),
    onSuccess: () => {
      invalidate(treeId)
      onDone()
    },
  })
  return (
    <form
      className="form condition-form"
      onSubmit={(e) => {
        e.preventDefault()
        add.mutate()
      }}
    >
      <div className="grid-2">
        <label className="field">
          <span className="field-label">Condition</span>
          <input autoFocus required maxLength={200} placeholder="Type 2 diabetes" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Status</span>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })}>
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Year</span>
          <input inputMode="numeric" maxLength={4} placeholder="Optional" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, '') })} />
        </label>
        <label className="field">
          <span className="field-label">Note</span>
          <input maxLength={500} placeholder="Optional, e.g. screened yearly" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
      </div>
      <ErrorText error={add.error} />
      <div className="actions">
        <button className="btn btn-sm" disabled={add.isPending || !form.name.trim()}>
          Add
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}
