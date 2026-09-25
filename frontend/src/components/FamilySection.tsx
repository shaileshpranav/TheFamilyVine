import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api, type Person, type PersonDetail, type RelativeOut, unwrap } from '../api/client'
import { useInvalidateTree } from '../api/hooks'
import { lifespan } from '../lib/dates'
import { type PartnerStatus, RELATIVE_GROUPS, STATUS_LABEL } from '../lib/genealogy'
import { Avatar, ErrorText, Label, Tag } from './ui'

/** Parents, step-parents, partners, siblings, children… each linked to their own page. */
export default function FamilySection({
  treeId,
  person,
  people,
  meId,
}: {
  treeId: string
  person: PersonDetail
  people: Map<string, Person>
  meId: string | null
}) {
  const groups = RELATIVE_GROUPS.map((g) => ({
    ...g,
    items: person.relatives.filter((r) => g.relations.includes(r.relation)),
  })).filter((g) => g.items.length > 0)

  return (
    <section className="card">
      <Label>Family</Label>
      {groups.length === 0 ? (
        <p className="muted small">No relatives recorded yet.</p>
      ) : (
        <div className="family-groups">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="family-group-label">{g.label}</p>
              <ul className="plain">
                {g.items.map((r) => (
                  <RelativeRow
                    key={r.person_id}
                    treeId={treeId}
                    relative={r}
                    person={person}
                    people={people}
                    meId={meId}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function RelativeRow({
  treeId,
  relative: r,
  person,
  people,
  meId,
}: {
  treeId: string
  relative: RelativeOut
  person: PersonDetail
  people: Map<string, Person>
  meId: string | null
}) {
  const invalidate = useInvalidateTree()
  const setStatus = useMutation({
    mutationFn: (status: PartnerStatus) =>
      unwrap(
        api.PATCH('/api/trees/{tree_id}/families/{family_id}', {
          params: { path: { tree_id: treeId, family_id: r.family_id! } },
          body: { status },
        }),
      ),
    onSuccess: () => invalidate(treeId),
  })

  const p = people.get(r.person_id)
  const name = p?.display_name ?? 'Unknown'
  const via = r.via_person_id ? people.get(r.via_person_id)?.display_name : null
  const marriage = person.timeline.find(
    (i) => i.kind === 'family' && i.family_id === r.family_id && i.type === 'marriage',
  )

  const notes: string[] = []
  if (r.relation === 'step_parent' && via) notes.push(`Partner of ${via}`)
  if ((r.relation === 'step_child' || r.relation === 'step_sibling') && via) notes.push(`Child of ${via}`)
  if (marriage?.date?.short) notes.push(`Married ${marriage.date.short}`)
  const span = p ? lifespan(p.birth, p.death) : ''

  return (
    <li className="relative-row">
      <Link to={`../${r.person_id}`} relative="path" className="rel-link grow">
        <Avatar name={name} size="sm" me={r.person_id === meId} deceased={p ? !p.is_living : false} />
        <span className="grow">
          <span className="rel-name">
            <span>{name}</span>
            {r.relation === 'half_sibling' && <Tag>Half</Tag>}
            {r.pedigree && r.pedigree !== 'biological' && <Tag tone="blue">{r.pedigree}</Tag>}
            {r.status && r.status !== 'together' && r.relation === 'partner' && !r.can_edit_family && (
              <Tag tone="yellow">{STATUS_LABEL[r.status]}</Tag>
            )}
          </span>
          {(span || notes.length > 0) && (
            <span className="rel-sub">
              {span && <span className="mono">{span}</span>}
              {span && notes.length > 0 && ' · '}
              {notes.join(' · ')}
            </span>
          )}
        </span>
      </Link>
      {r.relation === 'partner' && r.can_edit_family && r.family_id && (
        <select
          className="status-select"
          aria-label={`Status of ${person.given_names || person.display_name} and ${name}`}
          value={r.status ?? 'together'}
          disabled={setStatus.isPending}
          onChange={(e) => setStatus.mutate(e.target.value as PartnerStatus)}
        >
          {(Object.keys(STATUS_LABEL) as PartnerStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      )}
      <ErrorText error={setStatus.error} />
    </li>
  )
}
