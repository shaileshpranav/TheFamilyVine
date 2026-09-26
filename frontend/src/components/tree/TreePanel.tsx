import { Crosshair, Path, UserPlus, X } from '@phosphor-icons/react'
import { Link } from 'react-router'
import type { Tree } from '../../api/client'
import { usePeople, usePerson } from '../../api/hooks'
import { lifespan } from '../../lib/dates'
import { type NewRelation, RELATION_NAME, STATUS_LABEL } from '../../lib/genealogy'
import AddPersonForm from '../AddPersonForm'
import { MakeParentButton } from '../FamilySection'
import RelationPicker from '../RelationPicker'
import { Avatar, ErrorText, Label, LivingBadge, Loading, YouTag } from '../ui'

export type PanelMode = 'view' | 'pick' | { relation: NewRelation }

/** Quick view of the selected person, with adding a relative right on the canvas. */
export default function TreePanel({
  tree,
  personId,
  mode,
  onModeChange,
  onClose,
  onSelect,
  onCentre,
  onAdded,
  onRelate,
  relationLabel,
}: {
  tree: Tree
  personId: string
  mode: PanelMode
  onModeChange: (mode: PanelMode) => void
  onClose: () => void
  /** Jump to another person on the canvas. */
  onSelect: (id: string) => void
  onCentre: (id: string) => void
  onAdded: (id: string) => void
  /** Open "How are we related?" with this person. */
  onRelate: (id: string) => void
  /** What they are to the viewer: "Your first cousin". */
  relationLabel: string | null
}) {
  const { data: person, error, isLoading } = usePerson(tree.id, personId)
  const { data: everyone } = usePeople(tree.id)
  const people = new Map((everyone ?? []).map((p) => [p.id, p]))

  return (
    <aside className="tree-panel" aria-label="Person">
      <button type="button" className="btn btn-ghost btn-icon tree-panel-close" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </button>
      {isLoading ? (
        <Loading rows={2} />
      ) : error || !person ? (
        <ErrorText error={error ?? 'Person not found'} />
      ) : (
        <>
          <header className="tree-panel-head">
            <Avatar name={person.display_name} size="lg" me={person.id === tree.access.my_person_id} deceased={!person.is_living} />
            <div className="grow">
              <h2 className="tree-panel-name">{person.display_name}</h2>
              {person.native_name && <p className="small">{person.native_name}</p>}
              {relationLabel && person.id !== tree.access.my_person_id && (
                <p className="relation-to-you">{relationLabel}</p>
              )}
              <div className="person-meta" style={{ marginTop: 8 }}>
                <LivingBadge living={person.is_living} />
                {person.id === tree.access.my_person_id && <YouTag />}
                {lifespan(person.birth, person.death) && (
                  <span className="mono">{lifespan(person.birth, person.death)}</span>
                )}
              </div>
            </div>
          </header>

          {mode === 'pick' ? (
            <RelationPicker person={person} onPick={(relation) => onModeChange({ relation })} onCancel={() => onModeChange('view')} />
          ) : typeof mode === 'object' ? (
            <AddPersonForm
              key={mode.relation}
              treeId={tree.id}
              anchor={person}
              relation={mode.relation}
              onDone={(created) => {
                onModeChange('view')
                if (created) onAdded(created.id)
              }}
            />
          ) : (
            <>
              <div className="actions">
                <Link to={`../people/${person.id}`} relative="path" className="btn btn-secondary btn-sm">
                  View full profile
                </Link>
                {person.permissions.can_add_relatives && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onModeChange('pick')}>
                    <UserPlus size={15} /> Add a relative
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRelate(person.id)}>
                  <Path size={15} /> How are we related?
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon push-right"
                  aria-label="Centre on the tree"
                  title="Centre on the tree"
                  onClick={() => onCentre(person.id)}
                >
                  <Crosshair size={16} />
                </button>
              </div>

              {person.bio && <p className="tree-panel-bio">{person.bio}</p>}

              {(person.birth || person.death || person.occupation) && (
                <dl className="facts tree-panel-section">
                  {person.birth && (
                    <div>
                      <dt>Born</dt>
                      <dd>{[person.birth.date?.label, person.birth.place].filter(Boolean).join(' · ') || 'Date not known'}</dd>
                    </div>
                  )}
                  {person.death && (
                    <div>
                      <dt>Died</dt>
                      <dd>{[person.death.date?.label, person.death.place].filter(Boolean).join(' · ') || 'Date not known'}</dd>
                    </div>
                  )}
                  {person.occupation && (
                    <div>
                      <dt>Career</dt>
                      <dd>{person.occupation}</dd>
                    </div>
                  )}
                </dl>
              )}

              {person.relatives.length > 0 && (
                <section className="tree-panel-section">
                  <Label>Family</Label>
                  <ul className="plain">
                    {person.relatives.map((r) => {
                      const p = people.get(r.person_id)
                      const name = p?.display_name ?? 'Unknown'
                      const status = r.relation === 'partner' && r.status && r.status !== 'together' ? ` · ${STATUS_LABEL[r.status]}` : ''
                      return (
                        <li key={r.person_id} className="relative-row">
                          <button type="button" className="rel-link tree-panel-rel grow" onClick={() => onSelect(r.person_id)}>
                            <Avatar name={name} size="sm" me={r.person_id === tree.access.my_person_id} deceased={p ? !p.is_living : false} />
                            <span className="grow">
                              <span className="rel-name">{name}</span>
                              <span className="rel-sub">
                                {RELATION_NAME[r.relation]}
                                {status}
                              </span>
                            </span>
                          </button>
                          <MakeParentButton treeId={tree.id} person={person} relative={r} people={people} />
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}

              {person.timeline.length > 0 && (
                <section className="tree-panel-section">
                  <Label>Timeline</Label>
                  <ol className="timeline">
                    {person.timeline.slice(0, 5).map((item) => (
                      <li key={item.key} className="tl-row">
                        <span className="tl-year mono">{item.date?.short || '—'}</span>
                        <span className="grow tl-summary">{item.summary}</span>
                      </li>
                    ))}
                  </ol>
                  {person.timeline.length > 5 && (
                    <Link to={`../people/${person.id}`} relative="path" className="small muted">
                      {person.timeline.length - 5} more on their profile
                    </Link>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </aside>
  )
}
