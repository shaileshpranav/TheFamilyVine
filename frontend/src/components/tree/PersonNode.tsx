import { Plus } from '@phosphor-icons/react'
import type { Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { lifespan } from '../../lib/dates'
import { initialsOf } from '../../lib/format'
import type { GraphPerson } from '../../lib/treeLayout'

export type PersonNodeData = {
  person: GraphPerson
  isMe: boolean
  selected: boolean
  canAdd: boolean
  onSelect: (id: string) => void
  onAdd: (id: string) => void
}
export type PersonNodeType = Node<PersonNodeData, 'person'>

/** A person on the canvas: a tile with their initials, then their name and years. */
function PersonNode({ data }: NodeProps<PersonNodeType>) {
  const { person, isMe, selected, canAdd, onSelect, onAdd } = data
  const years = lifespan(person.birth, person.death)
  const cls = ['tree-node', isMe && 'me', !person.is_living && 'deceased', selected && 'selected']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls}>
      <div className="tree-tile-wrap">
        <button
          type="button"
          className="tree-tile"
          aria-pressed={selected}
          aria-label={`${person.display_name}${years ? `, ${years}` : ''}${isMe ? ' (you)' : ''}`}
          onClick={() => onSelect(person.id)}
        >
          {initialsOf(person.display_name)}
        </button>
        {selected && canAdd && (
          <button
            type="button"
            className="tree-add"
            aria-label={`Add a relative of ${person.display_name}`}
            title="Add a relative"
            onClick={() => onAdd(person.id)}
          >
            <Plus size={13} weight="bold" />
          </button>
        )}
      </div>
      <div className="tree-name">{person.display_name}</div>
      {years && <div className="tree-years">{years}</div>}
    </div>
  )
}

export default memo(PersonNode)
