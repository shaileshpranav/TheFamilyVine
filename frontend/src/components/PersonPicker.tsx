import { MagnifyingGlass } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import type { Person } from '../api/client'
import { lifespan } from '../lib/dates'
import { Avatar } from './ui'

/** Choose someone already on the tree, by name. */
export default function PersonPicker({
  people,
  value,
  onChange,
}: {
  people: Person[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [q, setQ] = useState('')
  const listId = useId()
  const picked = value ? people.find((p) => p.id === value) : undefined

  if (picked) {
    return (
      <div className="picked-person">
        <Avatar name={picked.display_name} size="sm" deceased={!picked.is_living} />
        <span className="grow">
          <span className="rel-name">{picked.display_name}</span>
          <span className="rel-sub mono">{lifespan(picked.birth, picked.death)}</span>
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    )
  }

  const term = q.trim().toLowerCase()
  const matches = (term ? people.filter((p) => p.display_name.toLowerCase().includes(term)) : people).slice(0, 8)
  return (
    <div className="person-picker">
      <div className="search">
        <MagnifyingGlass size={16} />
        <input
          type="search"
          autoFocus
          placeholder="Search by name"
          aria-label="Search the people on this tree"
          aria-controls={listId}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ul className="plain picker-results" id={listId}>
        {matches.length === 0 && <li className="menu-item muted">No one by that name</li>}
        {matches.map((p) => (
          <li key={p.id}>
            <button type="button" className="menu-item" onClick={() => onChange(p.id)}>
              <span className="grow">{p.display_name}</span>
              <span className="mono muted">{lifespan(p.birth, p.death)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
