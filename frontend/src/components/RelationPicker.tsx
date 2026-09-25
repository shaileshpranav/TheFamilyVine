import {
  ArrowDown,
  ArrowUp,
  CaretRight,
  GitFork,
  Heart,
  type Icon,
  UsersThree,
} from '@phosphor-icons/react'
import type { PersonDetail } from '../api/client'
import { ADD_RELATION, type NewRelation } from '../lib/genealogy'

const ICON: Record<NewRelation, Icon> = {
  partner: Heart,
  parent: ArrowUp,
  child: ArrowDown,
  sibling: UsersThree,
  step_parent: ArrowUp,
  step_child: ArrowDown,
  step_sibling: GitFork,
}

const DIRECT: NewRelation[] = ['partner', 'parent', 'child', 'sibling']
const BLENDED: NewRelation[] = ['step_parent', 'step_child', 'step_sibling']

/** Why a relation can't be added yet, if it can't. */
function blocker(relation: NewRelation, person: PersonDetail): string | null {
  const has = (r: string) => person.relatives.some((x) => x.relation === r)
  if (relation === 'step_parent' && !has('parent')) return 'Add a parent first'
  if (relation === 'step_child' && !has('partner')) return 'Add a partner first'
  if (relation === 'step_sibling' && !has('step_parent')) return 'Add a step-parent first'
  if (relation === 'parent' && person.relatives.filter((x) => x.relation === 'parent').length >= 2)
    return 'Two parents are already recorded'
  return null
}

export default function RelationPicker({
  person,
  onPick,
  onCancel,
}: {
  person: PersonDetail
  onPick: (relation: NewRelation) => void
  onCancel: () => void
}) {
  const option = (relation: NewRelation) => {
    const Glyph = ICON[relation]
    const why = blocker(relation, person)
    return (
      <li key={relation}>
        <button
          type="button"
          className={`relation-option${ADD_RELATION[relation].blended ? ' blended' : ''}`}
          disabled={!!why}
          onClick={() => onPick(relation)}
        >
          <span className="relation-icon" aria-hidden="true">
            <Glyph size={18} />
          </span>
          <span className="grow">
            <span className="relation-label">{ADD_RELATION[relation].label}</span>
            <span className="relation-hint">{why ?? ADD_RELATION[relation].hint}</span>
          </span>
          <CaretRight size={14} className="row-caret" />
        </button>
      </li>
    )
  }

  return (
    <section className="card page-enter" style={{ marginBottom: 28 }}>
      <div className="section-head">
        <div>
          <h2 className="card-title">Add a relative</h2>
          <p className="muted small" style={{ marginTop: 4 }}>
            Connected to {person.display_name}
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="relation-groups">
        <div>
          <p className="family-group-label">Direct family</p>
          <ul className="plain">{DIRECT.map(option)}</ul>
        </div>
        <div>
          <p className="family-group-label">Blended family</p>
          <ul className="plain">{BLENDED.map(option)}</ul>
        </div>
      </div>
    </section>
  )
}
