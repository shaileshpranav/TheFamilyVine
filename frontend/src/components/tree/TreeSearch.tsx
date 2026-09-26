import { MagnifyingGlass } from '@phosphor-icons/react'
import { useState } from 'react'
import { lifespan } from '../../lib/dates'
import type { GraphPerson } from '../../lib/treeLayout'

/** Find someone on the canvas by name and jump to them. */
export default function TreeSearch({
  people,
  onPick,
}: {
  people: GraphPerson[]
  onPick: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const term = q.trim().toLowerCase()
  const matches = term ? people.filter((p) => p.display_name.toLowerCase().includes(term)).slice(0, 8) : []

  function pick(id: string) {
    onPick(id)
    setQ('')
    setOpen(false)
  }

  return (
    <div className="search tree-search" role="search">
      <MagnifyingGlass size={16} />
      <input
        type="search"
        placeholder="Find someone"
        aria-label="Find someone on the tree"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) pick(matches[0].id)
          if (e.key === 'Escape') {
            setQ('')
            setOpen(false)
          }
        }}
      />
      {open && term && (
        <ul className="menu tree-search-results" role="listbox" aria-label="Matches">
          {matches.length === 0 && <li className="menu-item muted">No one by that name</li>}
          {matches.map((p) => (
            <li key={p.id} role="option" aria-selected={false}>
              {/* mousedown, so the pick lands before the input's blur closes the list */}
              <button type="button" className="menu-item" onMouseDown={(e) => { e.preventDefault(); pick(p.id) }}>
                <span className="grow">{p.display_name}</span>
                <span className="mono muted">{lifespan(p.birth, p.death)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
