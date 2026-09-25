import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type Person, type PersonDetail, type Schemas, unwrap } from '../api/client'
import { useInvalidateTree, usePeople } from '../api/hooks'
import { ADD_RELATION, type NewRelation, type PartnerStatus, STATUS_LABEL } from '../lib/genealogy'
import { ErrorText, Field } from './ui'

type FuzzyDate = Schemas['FuzzyDate']

function yearDate(year: string, approximate: boolean): FuzzyDate | null {
  const y = Number(year)
  if (!year.trim() || !Number.isInteger(y) || y < 1) return null
  return { qualifier: approximate ? 'about' : 'exact', year: y }
}

/** Who a step relation, or a new child, is connected through. */
function choicesFor(relation: NewRelation | undefined, anchor: PersonDetail | undefined, names: Map<string, Person>) {
  if (!relation || !anchor) return []
  const name = (id: string) => names.get(id)?.display_name ?? 'Unknown'
  const of = (rel: string) => anchor.relatives.filter((r) => r.relation === rel)
  switch (relation) {
    case 'step_parent':
      return of('parent').map((r) => ({ value: r.person_id, label: name(r.person_id) }))
    case 'step_child':
      return of('partner').map((r) => ({ value: r.person_id, label: name(r.person_id) }))
    case 'step_sibling':
      return of('step_parent').map((r) => ({ value: r.person_id, label: name(r.person_id) }))
    case 'child':
      return [
        ...of('partner').map((r) => ({ value: r.family_id!, label: name(r.person_id) })),
        { value: 'new', label: 'Not recorded' },
      ]
    default:
      return []
  }
}

const CHOICE_LABEL: Partial<Record<NewRelation, string>> = {
  step_parent: 'Partner of',
  step_child: 'Child of',
  step_sibling: 'Child of',
  child: 'Other parent',
}

/**
 * Adds a person, optionally as a relative of `anchor`.
 * `mode="me"` creates the signed-in member's own profile.
 */
export default function AddPersonForm({
  treeId,
  anchor,
  relation,
  mode = 'other',
  onDone,
}: {
  treeId: string
  anchor?: PersonDetail
  relation?: NewRelation
  mode?: 'other' | 'me'
  onDone: (created?: PersonDetail) => void
}) {
  const isMe = mode === 'me'
  const { data: everyone } = usePeople(treeId)
  const names = new Map((everyone ?? []).map((p) => [p.id, p]))
  const choices = choicesFor(relation, anchor, names)

  const [form, setForm] = useState({
    given_names: '',
    surname: '',
    birth_surname: '',
    native_name: '',
    sex: 'unknown' as Schemas['Sex'],
    is_living: true,
  })
  const [born, setBorn] = useState({ year: '', about: false })
  const [died, setDied] = useState({ year: '', about: false })
  const [status, setStatus] = useState<PartnerStatus>('together')
  const [choice, setChoice] = useState(choices[0]?.value ?? '')
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const invalidate = useInvalidateTree()

  const create = useMutation({
    mutationFn: () => {
      const link =
        anchor && relation
          ? {
              person_id: anchor.id,
              relation,
              status,
              ...(relation === 'child'
                ? choice === 'new'
                  ? { new_family: true }
                  : choice
                    ? { family_id: choice }
                    : {}
                : choice && relation.startsWith('step_')
                  ? { via_person_id: choice }
                  : {}),
            }
          : null
      return unwrap(
        api.POST('/api/trees/{tree_id}/people', {
          params: { path: { tree_id: treeId } },
          body: {
            ...form,
            is_me: isMe,
            relative: link,
            birth: yearDate(born.year, born.about),
            death: form.is_living || isMe ? null : yearDate(died.year, died.about),
          },
        }),
      )
    },
    onSuccess: (p) => {
      invalidate(treeId)
      onDone(p)
    },
  })

  const title = isMe
    ? 'Add yourself to the tree'
    : relation && anchor
      ? `${ADD_RELATION[relation].label} of ${anchor.display_name}`
      : 'Add a person'

  return (
    <form
      className="card form page-enter"
      style={{ marginBottom: 28 }}
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
    >
      <div className="form-head">
        <h2 className="card-title">{title}</h2>
        {isMe && <p className="muted small">This profile is linked to your account, so you can always edit it.</p>}
      </div>
      <div className="grid-2">
        <Field label="Given names">
          <input autoFocus value={form.given_names} onChange={(e) => set('given_names', e.target.value)} />
        </Field>
        <Field label="Surname">
          <input value={form.surname} onChange={(e) => set('surname', e.target.value)} />
        </Field>
        <Field label="Birth surname" hint="Maiden or earlier surname, if different">
          <input value={form.birth_surname} onChange={(e) => set('birth_surname', e.target.value)} />
        </Field>
        <Field label="Name in native script" hint="For example தமிழ் or हिन्दी">
          <input value={form.native_name} onChange={(e) => set('native_name', e.target.value)} />
        </Field>
        <Field label="Sex">
          <select value={form.sex} onChange={(e) => set('sex', e.target.value as Schemas['Sex'])}>
            <option value="unknown">Unknown</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </Field>
        {!isMe && (
          <Field label="Status" hint="Only admins can change this later">
            <select
              value={form.is_living ? 'living' : 'deceased'}
              onChange={(e) => set('is_living', e.target.value === 'living')}
            >
              <option value="living">Living</option>
              <option value="deceased">Deceased</option>
            </select>
          </Field>
        )}
        <YearField label="Year of birth" value={born} onChange={setBorn} />
        {!isMe && !form.is_living && <YearField label="Year of death" value={died} onChange={setDied} />}
        {relation && choices.length > 1 && (
          <Field label={CHOICE_LABEL[relation] ?? 'Through'}>
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              {choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {(relation === 'partner' || relation === 'step_parent') && (
          <Field label="Together now?">
            <select value={status} onChange={(e) => setStatus(e.target.value as PartnerStatus)}>
              {(Object.keys(STATUS_LABEL) as PartnerStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <ErrorText error={create.error} />
      <div className="actions">
        <button className="btn" disabled={create.isPending || !(form.given_names || form.surname)}>
          {isMe ? 'Create my profile' : 'Add person'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function YearField({
  label,
  value,
  onChange,
}: {
  label: string
  value: { year: string; about: boolean }
  onChange: (v: { year: string; about: boolean }) => void
}) {
  return (
    <Field label={label} hint="Optional. Add the full date later in the timeline.">
      <div className="actions" style={{ flexWrap: 'nowrap', gap: 12 }}>
        <input
          inputMode="numeric"
          maxLength={4}
          placeholder="1931"
          value={value.year}
          onChange={(e) => onChange({ ...value, year: e.target.value.replace(/\D/g, '') })}
          style={{ maxWidth: 120 }}
        />
        <label className="check">
          <input type="checkbox" checked={value.about} onChange={(e) => onChange({ ...value, about: e.target.checked })} />
          Approximate
        </label>
      </div>
    </Field>
  )
}
