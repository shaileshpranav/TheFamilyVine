import { Trash } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type TimelineItem, unwrap } from '../api/client'
import { keys, useInvalidateTree } from '../api/hooks'
import type { FuzzyDate, FuzzyDateOut } from '../lib/dates'
import { type EventType, FAMILY_EVENT_TYPES, PERSON_EVENT_TYPES } from '../lib/genealogy'
import DateInput from './DateInput'
import PlaceInput from './PlaceInput'
import { ErrorText, Field } from './ui'

export type EventOwner =
  | { kind: 'person'; personId: string; name: string }
  | { kind: 'family'; familyId: string; name: string }

function plainDate(d: FuzzyDateOut | null | undefined): FuzzyDate | null {
  if (!d) return null
  const { label: _label, short: _short, ...rest } = d
  return rest
}

/** Adds or edits one event, on a person or on a couple. */
export default function EventForm({
  treeId,
  owner,
  item,
  presetType,
  recorded = [],
  onDone,
}: {
  treeId: string
  owner: EventOwner
  item?: TimelineItem
  presetType?: EventType
  /** Types this person already has; birth and death can only be recorded once. */
  recorded?: EventType[]
  onDone: () => void
}) {
  const once: EventType[] = ['birth', 'death']
  const types = (owner.kind === 'person' ? PERSON_EVENT_TYPES : FAMILY_EVENT_TYPES).filter(
    (t) => !(once.includes(t.type) && recorded.includes(t.type) && t.type !== item?.type),
  )
  const fallback = types.some((t) => t.type === 'birth') ? 'birth' : owner.kind === 'person' ? 'residence' : 'marriage'
  const [type, setType] = useState<EventType>(item?.type ?? presetType ?? fallback)
  const [title, setTitle] = useState(item?.title ?? '')
  const [date, setDate] = useState<FuzzyDate | null>(plainDate(item?.date))
  const [place, setPlace] = useState(item?.place ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const invalidate = useInvalidateTree()
  const qc = useQueryClient()

  const done = () => {
    invalidate(treeId)
    qc.invalidateQueries({ queryKey: keys.places(treeId) })
    onDone()
  }
  const body = { type, title, description, date, place: place.trim() || null }
  const save = useMutation({
    mutationFn: () => {
      if (item?.event_id) {
        return unwrap(
          api.PATCH('/api/trees/{tree_id}/events/{event_id}', {
            params: { path: { tree_id: treeId, event_id: item.event_id } },
            body,
          }),
        )
      }
      return owner.kind === 'person'
        ? unwrap(
            api.POST('/api/trees/{tree_id}/people/{person_id}/events', {
              params: { path: { tree_id: treeId, person_id: owner.personId } },
              body,
            }),
          )
        : unwrap(
            api.POST('/api/trees/{tree_id}/families/{family_id}/events', {
              params: { path: { tree_id: treeId, family_id: owner.familyId } },
              body,
            }),
          )
    },
    onSuccess: done,
  })
  const remove = useMutation({
    mutationFn: () =>
      unwrap(
        api.DELETE('/api/trees/{tree_id}/events/{event_id}', {
          params: { path: { tree_id: treeId, event_id: item!.event_id! } },
        }),
      ),
    onSuccess: done,
  })

  const typeInfo = types.find((t) => t.type === type)
  const needsTitle = type === 'other'
  return (
    <form
      className="card form page-enter event-form"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <div className="form-head">
        <h3 className="card-title">{item ? 'Edit event' : 'Add an event'}</h3>
        <p className="muted small">
          {owner.kind === 'person' ? `In ${owner.name}’s life` : `For ${owner.name} as a couple`}
        </p>
      </div>
      <div className="grid-2">
        <Field label="What">
          <select value={type} onChange={(e) => setType(e.target.value as EventType)}>
            {types.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={needsTitle ? 'Describe it' : 'Details'} hint={needsTitle ? undefined : 'Optional'}>
          <input
            required={needsTitle}
            value={title}
            maxLength={200}
            placeholder={typeInfo?.placeholder || ''}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
      </div>
      <DateInput value={date} onChange={setDate} label="When" />
      <Field label="Where" hint="Optional">
        <PlaceInput treeId={treeId} value={place} onChange={setPlace} />
      </Field>
      <Field label="Notes" hint="Optional">
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <ErrorText error={save.error ?? remove.error} />
      <div className="actions">
        <button className="btn" disabled={save.isPending}>
          {item ? 'Save' : 'Add event'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        {item?.event_id && (
          <button
            type="button"
            className="btn btn-danger push-right"
            disabled={remove.isPending}
            onClick={() => confirm('Delete this event?') && remove.mutate()}
          >
            <Trash size={16} /> Delete
          </button>
        )}
      </div>
    </form>
  )
}
