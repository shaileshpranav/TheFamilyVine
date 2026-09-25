import { CaretRight, GitBranch, Plus, Trash } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, type Schemas, type Subtree, unwrap } from '../api/client'
import { useCurrentTree, useInvalidateTree, usePeople, useSubtreePeople, useSubtrees } from '../api/hooks'
import { Avatar, Empty, ErrorText, Field, LivingBadge, Loading, PageHeader } from '../components/ui'
import { staggerIndex } from '../lib/format'

const DIRECTION_LABEL: Record<Schemas['SubtreeDirection'], string> = {
  descendants: 'Descendants of',
  ancestors: 'Ancestors of',
  both: 'Ancestors and descendants of',
}

export default function BranchesTab() {
  const tree = useCurrentTree()
  const { data: subtrees, isLoading, error } = useSubtrees(tree.id)
  const { data: people } = usePeople(tree.id)
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const names = new Map((people ?? []).map((p) => [p.id, p.display_name]))
  const canManage = tree.access.can_manage_subtrees

  return (
    <>
      <PageHeader
        kicker={tree.name}
        title="Branches"
        lede="A branch is the part of the tree that grows from one person. Relatives join it automatically as they’re added, and members can be given a role on a single branch."
        actions={
          canManage &&
          !creating && (
            <button className="btn" onClick={() => setCreating(true)} disabled={!people?.length}>
              <Plus size={16} /> New branch
            </button>
          )
        }
      />
      {creating && <CreateBranch onDone={() => setCreating(false)} />}
      <ErrorText error={error} />
      {isLoading ? (
        <Loading rows={2} />
      ) : subtrees?.length ? (
        <div className="card card-flush">
          <ul className="rows stagger">
            {subtrees.map((s, i) => (
              <BranchRow
                key={s.id}
                index={i}
                subtree={s}
                rootName={names.get(s.root_person_id) ?? 'Unknown'}
                open={open === s.id}
                onToggle={() => setOpen(open === s.id ? null : s.id)}
                canManage={canManage}
              />
            ))}
          </ul>
        </div>
      ) : (
        !creating && (
          <Empty title="No branches yet">
            {canManage
              ? 'Create one for a side of the family, such as everyone descended from a grandparent.'
              : 'Admins can split the tree into branches.'}
          </Empty>
        )
      )}
    </>
  )
}

function BranchRow({
  subtree,
  rootName,
  open,
  onToggle,
  canManage,
  index,
}: {
  subtree: Subtree
  rootName: string
  open: boolean
  onToggle: () => void
  canManage: boolean
  index: number
}) {
  const tree = useCurrentTree()
  const { data: members, isLoading } = useSubtreePeople(tree.id, open ? subtree.id : null)
  const invalidate = useInvalidateTree()
  const remove = useMutation({
    mutationFn: () =>
      unwrap(
        api.DELETE('/api/trees/{tree_id}/subtrees/{subtree_id}', {
          params: { path: { tree_id: tree.id, subtree_id: subtree.id } },
        }),
      ),
    onSuccess: () => invalidate(tree.id),
  })

  return (
    <li style={staggerIndex(index)}>
      <div className="row" style={{ paddingRight: canManage ? 12 : 20 }}>
        <button type="button" className="row-toggle" onClick={onToggle} aria-expanded={open}>
          <span className="avatar" aria-hidden="true">
            <GitBranch size={18} />
          </span>
          <span className="grow">
            <span className="row-title">{subtree.name}</span>
            <span className="row-sub" style={{ display: 'block' }}>
              {DIRECTION_LABEL[subtree.direction]} {rootName}
              {subtree.include_spouses && ', with partners'} ·{' '}
              <span className="mono">{subtree.member_count} people</span>
            </span>
          </span>
          <CaretRight size={14} className={`row-caret${open ? ' open' : ''}`} />
        </button>
        {canManage && (
          <button
            className="btn btn-ghost btn-sm btn-icon"
            aria-label={`Delete branch ${subtree.name}`}
            title="Delete branch"
            onClick={() => {
              if (confirm(`Delete the branch “${subtree.name}”? Members who only have access to this branch lose it.`))
                remove.mutate()
            }}
          >
            <Trash size={15} />
          </button>
        )}
      </div>
      <ErrorText error={remove.error} />
      {open &&
        (isLoading ? (
          <p className="muted small" style={{ padding: '0 20px 16px' }}>
            Loading…
          </p>
        ) : (
          <ul className="plain" style={{ padding: '0 20px 18px 74px' }}>
            {members?.map((p) => (
              <li key={p.id}>
                <Link to={`../people/${p.id}`} relative="path" className="rel-link">
                  <Avatar name={p.display_name} size="sm" deceased={!p.is_living} />
                  <span>{p.display_name}</span>
                  <LivingBadge living={p.is_living} />
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </li>
  )
}

function CreateBranch({ onDone }: { onDone: () => void }) {
  const tree = useCurrentTree()
  const { data: people } = usePeople(tree.id)
  const [name, setName] = useState('')
  const [root, setRoot] = useState('')
  const [direction, setDirection] = useState<Schemas['SubtreeDirection']>('descendants')
  const [spouses, setSpouses] = useState(true)
  const invalidate = useInvalidateTree()
  const create = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/trees/{tree_id}/subtrees', {
          params: { path: { tree_id: tree.id } },
          body: { name, root_person_id: root, direction, include_spouses: spouses },
        }),
      ),
    onSuccess: () => {
      invalidate(tree.id)
      onDone()
    },
  })

  return (
    <form
      className="card form page-enter"
      style={{ marginBottom: 32 }}
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
    >
      <h2 className="card-title">New branch</h2>
      <div className="grid-2">
        <Field label="Name">
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Mum’s side" />
        </Field>
        <Field label="Starts from">
          <select required value={root} onChange={(e) => setRoot(e.target.value)}>
            <option value="" disabled>
              Choose a person
            </option>
            {people?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Includes">
          <select value={direction} onChange={(e) => setDirection(e.target.value as Schemas['SubtreeDirection'])}>
            <option value="descendants">Their descendants</option>
            <option value="ancestors">Their ancestors</option>
            <option value="both">Both</option>
          </select>
        </Field>
        <label className="check" style={{ alignSelf: 'end', minHeight: 38 }}>
          <input type="checkbox" checked={spouses} onChange={(e) => setSpouses(e.target.checked)} />
          Include partners
        </label>
      </div>
      <ErrorText error={create.error} />
      <div className="actions">
        <button className="btn" disabled={create.isPending}>
          Create branch
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}
