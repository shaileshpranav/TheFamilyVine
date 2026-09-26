import { CaretRight, MagnifyingGlass, Plus } from '@phosphor-icons/react'
import { useDeferredValue, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { Person } from '../api/client'
import { useCurrentTree, useKin, usePeople } from '../api/hooks'
import AddPersonForm from '../components/AddPersonForm'
import { Avatar, Empty, ErrorText, LivingBadge, Loading, PageHeader, YouTag } from '../components/ui'
import { lifespan } from '../lib/dates'
import { staggerIndex } from '../lib/format'

type Adding = null | 'other' | 'me'

export default function PeopleTab() {
  const tree = useCurrentTree()
  const { access } = tree
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const deferredQ = useDeferredValue(q.trim())
  const { data: people, isLoading, error } = usePeople(tree.id, deferredQ)
  const kin = useKin(tree.id)
  const meId = access.my_person_id
  // What each person is to the viewer, when the viewer is on the tree.
  const relationOf = (id: string) => {
    const rel = meId && kin && id !== meId ? kin.relate(meId, id) : null
    return rel && rel.kind !== 'none' ? rel.title : null
  }
  const initial = params.get('add')
  const [adding, setAdding] = useState<Adding>(initial === 'me' ? 'me' : initial === 'person' ? 'other' : null)
  const navigate = useNavigate()
  // Branch-only members must attach new people to a relative, from that person's page.
  const canAddFreestanding = access.can_create_people && access.tree_role !== null
  const canAddMe = !access.my_person_id && access.tree_role !== null

  function closeForm() {
    setAdding(null)
    if (params.has('add')) setParams({}, { replace: true })
  }

  return (
    <>
      <PageHeader
        kicker={tree.name}
        title="People"
        lede={
          tree.person_count
            ? `${tree.person_count} ${tree.person_count === 1 ? 'person' : 'people'}. Search by any name, including birth surnames and names in native script.`
            : undefined
        }
        actions={
          !adding && (
            <>
              {canAddMe && (
                <button className="btn btn-secondary" onClick={() => setAdding('me')}>
                  Add myself
                </button>
              )}
              {canAddFreestanding && (
                <button className="btn" onClick={() => setAdding('other')}>
                  <Plus size={16} /> Add person
                </button>
              )}
            </>
          )
        }
      />

      {adding && (
        <AddPersonForm
          treeId={tree.id}
          mode={adding}
          onDone={(p) => {
            closeForm()
            if (p) navigate(p.id)
          }}
        />
      )}

      <div className="toolbar">
        <div className="search">
          <MagnifyingGlass size={16} />
          <input
            type="search"
            placeholder="Search names"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search people"
          />
        </div>
      </div>

      <ErrorText error={error} />
      {isLoading ? (
        <Loading rows={5} />
      ) : people?.length ? (
        <div className="card card-flush">
          <ul className="rows stagger">
            {people.map((p, i) => (
              <PersonRow key={p.id} person={p} index={i} isMe={p.id === meId} relation={relationOf(p.id)} />
            ))}
          </ul>
        </div>
      ) : (
        <Empty title={q ? 'No matches' : 'No one here yet'}>
          {q
            ? 'Try a shorter part of the name, or a birth surname.'
            : 'Add the first person. It’s often the oldest ancestor you know about, or yourself.'}
        </Empty>
      )}
    </>
  )
}

function PersonRow({
  person,
  isMe,
  index,
  relation,
}: {
  person: Person
  isMe: boolean
  index: number
  relation: string | null
}) {
  const span = lifespan(person.birth, person.death)
  const secondary = [person.native_name, person.birth_surname && `née ${person.birth_surname}`, person.nickname && `“${person.nickname}”`]
    .filter(Boolean)
    .join(' · ')
  return (
    <li style={staggerIndex(index)}>
      <Link to={person.id} className="row">
        <Avatar name={person.display_name} me={isMe} deceased={!person.is_living} />
        <div className="grow">
          <div className="row-title">
            {person.display_name}
            {isMe && <YouTag />}
          </div>
          {(relation || span || secondary) && (
            <div className="row-sub">
              {relation && <span className="row-relation">{relation}</span>}
              {relation && (span || secondary) && ' · '}
              {span && <span className="mono">{span}</span>}
              {span && secondary && ' · '}
              {secondary}
            </div>
          )}
        </div>
        <LivingBadge living={person.is_living} />
        <CaretRight size={14} className="row-caret" />
      </Link>
    </li>
  )
}
