import { ArrowLeft, Info, PencilSimple, UserPlus } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { PersonDetail, Schemas } from '../api/client'
import { useCurrentTree, usePeople, usePerson } from '../api/hooks'
import AddPersonForm from '../components/AddPersonForm'
import FamilySection from '../components/FamilySection'
import ProfileEditor from '../components/ProfileEditor'
import { DetailsCard, FavoritesCard, Links, PetsCard } from '../components/ProfileDetails'
import RelationPicker from '../components/RelationPicker'
import Timeline, { type Couple } from '../components/Timeline'
import { Avatar, ErrorText, Label, LivingBadge, Loading, Reveal, YouTag } from '../components/ui'
import { lifespan } from '../lib/dates'
import type { EventType, NewRelation } from '../lib/genealogy'

type Panel = null | 'edit' | 'pick' | { relation: NewRelation }

export default function PersonPage() {
  const tree = useCurrentTree()
  const personId = useParams().personId!
  const { data: person, error, isLoading } = usePerson(tree.id, personId)
  const { data: everyone } = usePeople(tree.id)
  const [panel, setPanel] = useState<Panel>(null)
  const [adding, setAdding] = useState<EventType | 'any' | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  if (isLoading) return <Loading rows={2} />
  if (error || !person) return <ErrorText error={error ?? 'Person not found'} />

  const people = new Map((everyone ?? []).map((p) => [p.id, p]))
  const perms = person.permissions
  const meId = tree.access.my_person_id
  const isMe = person.id === meId
  const span = lifespan(person.birth, person.death)
  const meta = [
    person.birth_surname && `née ${person.birth_surname}`,
    person.nickname && `“${person.nickname}”`,
    person.sex !== 'unknown' && person.sex[0].toUpperCase() + person.sex.slice(1),
  ].filter(Boolean)
  const couples: Couple[] = person.relatives
    .filter((r) => r.relation === 'partner' && r.can_edit_family && r.family_id)
    .map((r) => ({ familyId: r.family_id!, partnerName: people.get(r.person_id)?.display_name ?? 'partner' }))

  function startAdding(type: EventType) {
    setAdding(type)
    requestAnimationFrame(() => timelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <>
      <Link to=".." relative="path" className="back">
        <ArrowLeft size={14} /> All people
      </Link>

      <header className="person-head page-enter">
        <Avatar name={person.display_name} size="lg" me={isMe} deceased={!person.is_living} />
        <div className="grow">
          <h1>
            {person.display_name}
            {isMe && <YouTag />}
          </h1>
          {person.native_name && <p className="native-name">{person.native_name}</p>}
          <div className="person-meta">
            <LivingBadge living={person.is_living} />
            {[span && <span key="span" className="mono">{span}</span>, ...meta.map((m) => <span key={String(m)}>{m}</span>)]
              .filter(Boolean)
              .flatMap((el, i) => (i === 0 ? [el] : [<span key={`dot-${i}`} aria-hidden="true">·</span>, el]))}
          </div>
        </div>
      </header>

      {!panel && (
        <div className="actions page-enter" style={{ marginBottom: 32 }}>
          {perms.can_edit && (
            <button className="btn btn-secondary" onClick={() => setPanel('edit')}>
              <PencilSimple size={16} /> Edit profile
            </button>
          )}
          {perms.can_add_relatives && (
            <button className="btn btn-ghost" onClick={() => setPanel('pick')}>
              <UserPlus size={16} /> Add a relative
            </button>
          )}
          {!perms.can_edit && (
            <p className="note">
              <Info size={15} /> {whyReadOnly(person, tree.access.highest_role)}
            </p>
          )}
        </div>
      )}

      {panel === 'edit' && <ProfileEditor treeId={tree.id} person={person} onDone={() => setPanel(null)} />}
      {panel === 'pick' && (
        <RelationPicker person={person} onPick={(relation) => setPanel({ relation })} onCancel={() => setPanel(null)} />
      )}
      {panel && typeof panel === 'object' && (
        <AddPersonForm
          key={panel.relation}
          treeId={tree.id}
          anchor={person}
          relation={panel.relation}
          onDone={() => setPanel(null)}
        />
      )}

      {panel !== 'edit' && (
        <div className="profile-layout">
          <div className="profile-main">
            <Reveal className="p-about">
              <section className="card">
                <Label>About</Label>
                {person.bio ? (
                  <p className="prewrap about-text">{person.bio}</p>
                ) : (
                  <p className="muted small">No biography yet.</p>
                )}
                <Links links={person.links} />
              </section>
            </Reveal>
            <Reveal className="p-family" delay={100}>
              <FamilySection treeId={tree.id} person={person} people={people} meId={meId} />
            </Reveal>
            <Reveal className="p-timeline" delay={140}>
              <div ref={timelineRef} style={{ scrollMarginTop: 24 }}>
                <Timeline treeId={tree.id} person={person} couples={couples} adding={adding} onAddingChange={setAdding} />
              </div>
            </Reveal>
          </div>
          <aside className="profile-side">
            <Reveal className="p-details" delay={60}>
              <DetailsCard person={person} onAddBirth={perms.can_edit ? () => startAdding('birth') : undefined} />
            </Reveal>
            {person.favorites.length > 0 && (
              <Reveal className="p-favorites" delay={180}>
                <FavoritesCard person={person} />
              </Reveal>
            )}
            {person.pets.length > 0 && (
              <Reveal className="p-pets" delay={200}>
                <PetsCard person={person} />
              </Reveal>
            )}
          </aside>
        </div>
      )}
    </>
  )
}

function whyReadOnly(person: PersonDetail, role: Schemas['Role']): string {
  if (role === 'personal') return 'You can only edit your own profile.'
  if (person.is_living) return 'Only admins can edit living people other than you.'
  return 'You can’t edit this person.'
}
