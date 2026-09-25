import { ArrowsLeftRight, CaretRight, GearSix, GitBranch, Plus, Users } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { ROLE_INFO, type Tree } from '../api/client'
import { useMembers, usePeople, useSubtrees } from '../api/hooks'
import { Avatar, Label, RoleBadge } from './ui'

/** The signed-in member's own person in this tree, or a prompt to add themselves. */
export function YourProfileCard({ tree }: { tree: Tree }) {
  const { data: people } = usePeople(tree.id)
  const mine = people?.find((p) => p.id === tree.access.my_person_id)

  if (tree.access.my_person_id && mine) {
    return (
      <Link to={`/trees/${tree.id}/people/${mine.id}`} className="card card-link" style={{ height: '100%' }}>
        <Label>Your profile</Label>
        <Avatar name={mine.display_name} size="lg" me />
        <p className="card-title" style={{ marginTop: 16 }}>
          {mine.display_name}
        </p>
        <p className="muted small" style={{ marginTop: 4 }}>
          {mine.native_name || 'Keep your details up to date for the family.'}
        </p>
        <div className="card-foot">
          Open your profile <CaretRight size={13} />
        </div>
      </Link>
    )
  }
  return (
    <div className="card" style={{ height: '100%' }}>
      <Label>Your profile</Label>
      <p className="card-title">You’re not in this tree yet</p>
      <p className="muted small" style={{ marginTop: 6 }}>
        Add yourself so relatives can see where you fit.
      </p>
      <div className="actions" style={{ marginTop: 18 }}>
        <Link to={`/trees/${tree.id}/people?add=me`} className="btn btn-secondary btn-sm">
          <Plus size={14} /> Add yourself
        </Link>
      </div>
    </div>
  )
}

/** What the signed-in member can do here, tree-wide and per branch. */
export function AccessCard({ tree }: { tree: Tree }) {
  const { access } = tree
  return (
    <div className="card" style={{ height: '100%' }}>
      <Label>Your access</Label>
      <ul className="plain" style={{ gap: 16 }}>
        {access.tree_role && (
          <li>
            <div className="actions" style={{ gap: 8 }}>
              <span className="field-label">Whole tree</span>
              <RoleBadge role={access.tree_role} />
            </div>
            <p className="muted small" style={{ marginTop: 4 }}>
              {ROLE_INFO[access.tree_role].description}.
            </p>
          </li>
        )}
        {access.subtree_roles.map((s) => (
          <li key={s.subtree_id}>
            <div className="actions" style={{ gap: 8 }}>
              <span className="field-label">Branch: {s.subtree_name}</span>
              <RoleBadge role={s.role} />
            </div>
            <p className="muted small" style={{ marginTop: 4 }}>
              {ROLE_INFO[s.role].description}.
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Links to the tree's members, branches and settings, with counts. */
export function TreeLinksCard({ tree, withSwitch = false }: { tree: Tree; withSwitch?: boolean }) {
  const { data: members } = useMembers(tree.id)
  const { data: subtrees } = useSubtrees(tree.id)
  const manages = tree.access.can_manage_members || tree.access.can_manage_subtrees
  const base = `/trees/${tree.id}`
  const links = [
    { to: `${base}/members`, label: 'Members', icon: Users, count: members?.length },
    { to: `${base}/branches`, label: 'Branches', icon: GitBranch, count: subtrees?.length },
    { to: `${base}/settings`, label: 'Settings', icon: GearSix },
    ...(withSwitch ? [{ to: '/', label: 'Switch tree', icon: ArrowsLeftRight }] : []),
  ]
  return (
    <div className="card card-flush" style={{ height: '100%' }}>
      <div style={{ padding: '22px 20px 8px' }}>
        <Label>{manages ? 'Manage this tree' : 'This tree'}</Label>
      </div>
      <ul className="rows">
        {links.map(({ to, label, icon: Glyph, count }) => (
          <li key={to}>
            <Link to={to} className="row">
              <Glyph size={17} className="muted" />
              <span className="grow">{label}</span>
              {count !== undefined && <span className="mono muted">{count}</span>}
              <CaretRight size={14} className="row-caret" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
