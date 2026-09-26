import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { api, type Person, type PersonDetail, type Schemas, unwrap } from '../api/client'
import { useInvalidateTree, usePeople, usePerson } from '../api/hooks'
import { ADD_RELATION, type NewRelation, type PartnerStatus, STATUS_LABEL } from '../lib/genealogy'
import PersonPicker from './PersonPicker'
import { ErrorText, Field } from './ui'

type FuzzyDate = Schemas['FuzzyDate']

function yearDate(year: string, approximate: boolean): FuzzyDate | null {
  const y = Number(year)
  if (!year.trim() || !Number.isInteger(y) || y < 1) return null
  return { qualifier: approximate ? 'about' : 'exact', year: y }
}

/**
 * Who they're connected through: the other parent of a child, or the parent, partner or
 * step-parent behind a step relation. `other` is the person being connected, when they're
 * already on the tree.
 */
function choicesFor(
  relation: NewRelation | undefined,
  anchor: PersonDetail | undefined,
  other: PersonDetail | undefined,
  names: Map<string, Person>,
) {
  if (!relation || !anchor) return []
  const name = (id: string) => names.get(id)?.display_name ?? 'Unknown'
  const of = (person: PersonDetail, rel: string) => person.relatives.filter((r) => r.relation === rel)
  const couples = (person: PersonDetail) => [
    ...of(person, 'partner').map((r) => ({ value: r.family_id!, label: name(r.person_id) })),
    { value: 'new', label: 'Not recorded' },
  ]
  switch (relation) {
    case 'step_parent':
      return of(anchor, 'parent').map((r) => ({ value: r.person_id, label: name(r.person_id) }))
    case 'step_child':
      return of(anchor, 'partner').map((r) => ({ value: r.person_id, label: name(r.person_id) }))
    case 'step_sibling':
      return of(anchor, 'step_parent').map((r) => ({ value: r.person_id, label: name(r.person_id) }))
    case 'child':
      // A child who already has a parent recorded keeps them as the other parent.
      return other?.parents.length ? [] : couples(anchor)
    case 'parent':
      // Only a parent already on the tree can have a partner who might be the other parent.
      return other && !anchor.parents.length && of(other, 'partner').length ? couples(other) : []
    default:
      return []
  }
}

const CHOICE_LABEL: Partial<Record<NewRelation, string>> = {
  step_parent: 'Partner of',
  step_child: 'Child of',
  step_sibling: 'Child of',
  child: 'Other parent',
  parent: 'Other parent',
}

/**
 * Adds a person, optionally as a relative of `anchor`, or connects someone already on the
 * tree to `anchor`. `mode="me"` creates the signed-in member's own profile.
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
  const canConnect = !isMe && !!anchor && !!relation
  const [source, setSource] = useState<'new' | 'existing'>('new')
  const existing = canConnect && source === 'existing'
  const [pickedId, setPickedId] = useState<string | null>(null)
  const { data: picked } = usePerson(treeId, existing ? pickedId : null)
  const other = existing && picked?.id === pickedId ? picked : undefined
  const { data: everyone } = usePeople(treeId)
  const names = new Map((everyone ?? []).map((p) => [p.id, p]))
  const choices = choicesFor(relation, anchor, other, names)

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
  const [choice, setChoice] = useState('')
  // The options change with the person picked, so fall back to the first one.
  const chosen = choices.some((c) => c.value === choice) ? choice : (choices[0]?.value ?? '')
  // A partner is usually the other parent of children recorded with only one parent.
  const shareable =
    relation === 'partner' && anchor ? [...new Set([...anchor.only_parent_of, ...(other?.only_parent_of ?? [])])] : []
  const [unticked, setUnticked] = useState<string[]>([])
  const shareId = useId()
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const invalidate = useInvalidateTree()

  const link =
    anchor && relation
      ? {
          person_id: anchor.id,
          relation,
          status,
          ...(relation === 'partner' ? { also_parent_of: shareable.filter((id) => !unticked.includes(id)) } : {}),
          ...(relation === 'child' || relation === 'parent'
            ? chosen === 'new'
              ? { new_family: true }
              : chosen
                ? { family_id: chosen }
                : {}
            : chosen && relation.startsWith('step_')
              ? { via_person_id: chosen }
              : {}),
        }
      : null

  const save = useMutation({
    mutationFn: () =>
      existing && link
        ? unwrap(
            api.POST('/api/trees/{tree_id}/people/{person_id}/relatives', {
              params: { path: { tree_id: treeId, person_id: pickedId! } },
              body: link,
            }),
          )
        : unwrap(
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
          ),
    onSuccess: (p) => {
      invalidate(treeId)
      onDone(p)
    },
  })

  // Anyone already related this way isn't offered again.
  const taken = new Set([
    anchor?.id,
    ...(anchor?.relatives ?? []).filter((r) => r.relation === relation).map((r) => r.person_id),
  ])
  const candidates = (everyone ?? []).filter((p) => !taken.has(p.id))
  const name = (id: string) => names.get(id)?.display_name ?? 'Unknown'
  const full = relation === 'child' && (other?.parents.length ?? 0) >= 2
  const note =
    !other || !anchor
      ? null
      : full
        ? `${other.display_name} already has two parents recorded.`
        : relation === 'child' && other.parents.length === 1
          ? `${anchor.display_name} becomes ${other.display_name}’s other parent, alongside ${name(other.parents[0])}.`
          : relation === 'parent' && anchor.parents.length === 1
            ? `${other.display_name} becomes ${anchor.display_name}’s other parent, alongside ${name(anchor.parents[0])}.`
            : null

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
        save.mutate()
      }}
    >
      <div className="form-head">
        <h2 className="card-title">{title}</h2>
        {isMe && <p className="muted small">This profile is linked to your account, so you can always edit it.</p>}
      </div>
      {canConnect && (
        <div className="seg" role="radiogroup" aria-label="Who to add">
          {(['new', 'existing'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={source === s}
              className={`seg-opt${source === s ? ' on' : ''}`}
              onClick={() => setSource(s)}
            >
              {s === 'new' ? 'New person' : 'Already in the tree'}
            </button>
          ))}
        </div>
      )}
      <div className="grid-2">
        {existing ? (
          <div className="field grid-full">
            <span className="field-label">Person</span>
            <PersonPicker people={candidates} value={pickedId} onChange={setPickedId} />
          </div>
        ) : (
          <>
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
          </>
        )}
        {relation && choices.length > 1 && (
          <Field label={CHOICE_LABEL[relation] ?? 'Through'}>
            <select value={chosen} onChange={(e) => setChoice(e.target.value)}>
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
        {shareable.length > 0 && anchor && (
          <div className="field" role="group" aria-labelledby={shareId}>
            <span className="field-label" id={shareId}>
              Also the parent of
            </span>
            {shareable.map((id) => (
              <label key={id} className="check">
                <input
                  type="checkbox"
                  checked={!unticked.includes(id)}
                  onChange={(e) =>
                    setUnticked((ids) => (e.target.checked ? ids.filter((x) => x !== id) : [...ids, id]))
                  }
                />
                {name(id)}
              </label>
            ))}
            <span className="field-hint">
              {existing
                ? 'Untick anyone who isn’t both of theirs, such as a child from an earlier relationship.'
                : `Untick anyone who is only ${anchor.given_names || anchor.display_name}’s child, such as a child from an earlier relationship.`}
            </span>
          </div>
        )}
        {note && <p className="field-hint grid-full">{note}</p>}
      </div>
      <ErrorText error={save.error} />
      <div className="actions">
        <button
          className="btn"
          disabled={save.isPending || (existing ? !other || full : !(form.given_names || form.surname))}
        >
          {existing ? 'Connect' : isMe ? 'Create my profile' : 'Add person'}
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
