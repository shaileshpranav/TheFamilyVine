import { CaretRight, Plus, TreeStructure, UserPlus } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { useCurrentTree, useKin, useMe, useMembers, usePeople, useSubtrees, useTreeGraph } from '../api/hooks'
import OnThisDay from '../components/OnThisDay'
import { AccessCard, TreeLinksCard, YourProfileCard } from '../components/TreeCards'
import { Avatar, Label, PageHeader, Reveal, Tag, YouTag } from '../components/ui'
import { staggerIndex, timeAgo } from '../lib/format'
import { assignGenerations } from '../lib/treeLayout'
import { photoUrl } from '../lib/photos'

export default function TreeHome() {
  const tree = useCurrentTree()
  const { access } = tree
  const { data: people } = usePeople(tree.id)
  const { data: subtrees } = useSubtrees(tree.id)
  const { data: members } = useMembers(tree.id)
  const { data: me } = useMe()
  const { data: graph } = useTreeGraph(tree.id)
  const kin = useKin(tree.id)
  const meId = access.my_person_id

  const count = people?.length ?? tree.person_count
  const living = people?.filter((p) => p.is_living).length
  const recent = [...(people ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5)
  const generations = graph?.people.length ? new Set(assignGenerations(graph).values()).size : null
  const myName = people?.find((p) => p.id === meId)?.given_names || me?.display_name?.split(/\s+/)[0]
  /** What someone is to the viewer: "Daughter". */
  const relationOf = (id: string) => {
    const rel = meId && kin && id !== meId ? kin.relate(meId, id) : null
    return rel && rel.kind !== 'none' ? rel.title : null
  }
  // Branch-only members add people from a relative's page so they stay inside their branch.
  const canAddFreestanding = access.can_create_people && access.tree_role !== null

  const cover = photoUrl(tree.id, tree.cover_photo_id, 'full')
  return (
    <>
      {cover && (
        <div className="tree-cover page-enter">
          <img src={cover} alt="" />
        </div>
      )}
      <PageHeader
        kicker={myName ? `Welcome back, ${myName}` : 'Family tree'}
        title={tree.name}
        lede={tree.description || undefined}
        actions={
          <>
            {access.can_manage_members && (
              <Link to="members" className="btn btn-ghost">
                <UserPlus size={16} /> Invite
              </Link>
            )}
            {canAddFreestanding && (
              <Link to="people?add=person" className="btn btn-secondary">
                <Plus size={16} /> Add person
              </Link>
            )}
            <Link to="tree" className="btn">
              <TreeStructure size={16} /> Open the tree
            </Link>
          </>
        }
      />

      <div className="stat-row page-enter">
        {generations && (
          <Tag>
            {generations} {generations === 1 ? 'generation' : 'generations'}
          </Tag>
        )}
        <Tag>
          {count} {count === 1 ? 'person' : 'people'}
        </Tag>
        {living !== undefined && <Tag tone="green">{living} living</Tag>}
        {tree.photo_count > 0 && (
          <Tag>
            {tree.photo_count} {tree.photo_count === 1 ? 'photo' : 'photos'}
          </Tag>
        )}
        {subtrees && subtrees.length > 0 && (
          <Tag tone="blue">
            {subtrees.length} {subtrees.length === 1 ? 'branch' : 'branches'}
          </Tag>
        )}
        {members && (
          <Tag tone="yellow">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </Tag>
        )}
      </div>

      <div className="bento">
        {graph && (
          <Reveal className="span-3">
            <OnThisDay graph={graph} kin={kin} meId={meId} />
          </Reveal>
        )}
        <Reveal className={graph ? 'span-3' : 'span-4'} delay={40}>
          <section className="card card-flush" style={{ height: '100%' }}>
            <div className="section-head" style={{ padding: '22px 20px 8px', marginBottom: 0 }}>
              <Label>Recently added</Label>
              <Link to="people" className="small muted">
                All people
              </Link>
            </div>
            {people && recent.length === 0 ? (
              <p className="muted small" style={{ padding: '4px 20px 22px' }}>
                No one here yet.{' '}
                {access.my_person_id ? '' : 'Start by adding yourself, or the oldest ancestor you know about.'}
              </p>
            ) : (
              <ul className="rows stagger">
                {recent.map((p, i) => (
                  <li key={p.id} style={staggerIndex(i)}>
                    <Link to={`people/${p.id}`} className="row">
                      <Avatar
                        name={p.display_name}
                        me={p.id === access.my_person_id}
                        deceased={!p.is_living}
                        photo={photoUrl(tree.id, p.photo_id)}
                      />
                      <div className="grow">
                        <div className="row-title">
                          {p.display_name}
                          {p.id === access.my_person_id && <YouTag />}
                        </div>
                        <div className="row-sub">
                          {relationOf(p.id) && <span className="row-relation">{relationOf(p.id)} · </span>}
                          added {timeAgo(p.created_at)}
                        </div>
                      </div>
                      <CaretRight size={14} className="row-caret" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Reveal>
        <Reveal className="span-2" delay={80}>
          <YourProfileCard tree={tree} />
        </Reveal>
        <Reveal className="span-2" delay={120}>
          <AccessCard tree={tree} />
        </Reveal>
        <Reveal className="span-2" delay={160}>
          <TreeLinksCard tree={tree} />
        </Reveal>
      </div>
    </>
  )
}
