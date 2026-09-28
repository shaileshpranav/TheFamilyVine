import { SignOut, Trash } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api, unwrap } from '../api/client'
import { keys, useCurrentTree, useInvalidateTree, useMe, useMembers } from '../api/hooks'
import CoverCard from '../components/CoverCard'
import { ErrorText, Field, Label, PageHeader, Reveal } from '../components/ui'

export default function SettingsTab() {
  const tree = useCurrentTree()
  const { access } = tree
  return (
    <>
      <PageHeader kicker={tree.name} title="Settings" />
      <div className="stack" style={{ gap: 20 }}>
        {access.can_manage_subtrees && (
          <Reveal>
            <TreeDetails />
          </Reveal>
        )}
        {access.can_manage_subtrees && (
          <Reveal delay={40}>
            <CoverCard tree={tree} />
          </Reveal>
        )}
        <Reveal delay={80}>{access.is_owner ? <OwnerZone /> : <LeaveTree />}</Reveal>
      </div>
    </>
  )
}

function TreeDetails() {
  const tree = useCurrentTree()
  const [name, setName] = useState(tree.name)
  const [description, setDescription] = useState(tree.description)
  const invalidate = useInvalidateTree()
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: () =>
      unwrap(api.PATCH('/api/trees/{tree_id}', { params: { path: { tree_id: tree.id } }, body: { name, description } })),
    onSuccess: () => {
      invalidate(tree.id)
      qc.invalidateQueries({ queryKey: keys.trees })
    },
  })
  const dirty = name !== tree.name || description !== tree.description
  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Label>Tree details</Label>
      <Field label="Name">
        <input required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <ErrorText error={save.error} />
      <div className="actions">
        <button className="btn" disabled={!dirty || save.isPending}>
          Save changes
        </button>
        {save.isSuccess && !dirty && <span className="muted small">Saved</span>}
      </div>
    </form>
  )
}

function OwnerZone() {
  const tree = useCurrentTree()
  const { data: members } = useMembers(tree.id)
  const { data: me } = useMe()
  const [newOwner, setNewOwner] = useState('')
  const invalidate = useInvalidateTree()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const candidates = (members ?? []).filter((m) => m.subtree_id === null && m.user.id !== me?.id)

  const transfer = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/trees/{tree_id}/transfer', {
          params: { path: { tree_id: tree.id } },
          body: { user_id: newOwner },
        }),
      ),
    onSuccess: () => invalidate(tree.id),
  })
  const del = useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/trees/{tree_id}', { params: { path: { tree_id: tree.id } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.trees })
      navigate('/')
    },
  })

  return (
    <div className="card form danger-zone">
      <Label>Owner actions</Label>
      <div className="field">
        <label className="field-label" htmlFor="new-owner">
          Transfer ownership
        </label>
        <div className="actions" style={{ flexWrap: 'nowrap' }}>
          <select id="new-owner" value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
            <option value="">Choose a member</option>
            {candidates.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.display_name} ({m.user.email})
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            disabled={!newOwner || transfer.isPending}
            onClick={() => {
              if (confirm('Transfer ownership? You’ll become an admin and can’t undo this yourself.')) transfer.mutate()
            }}
          >
            Transfer
          </button>
        </div>
        <span className="field-hint">You’ll become an admin. Only members of the whole tree can become owner.</span>
      </div>
      <div className="field">
        <span className="field-label">Delete this tree</span>
        <span className="field-hint">Permanently removes the tree and everyone in it. This can’t be undone.</span>
        <div className="actions" style={{ marginTop: 6 }}>
          <button
            className="btn btn-danger"
            onClick={() => {
              const typed = prompt(`Type “${tree.name}” to permanently delete it and everyone in it.`)
              if (typed === tree.name) del.mutate()
            }}
          >
            <Trash size={16} /> Delete tree
          </button>
        </div>
      </div>
      <ErrorText error={transfer.error ?? del.error} />
    </div>
  )
}

function LeaveTree() {
  const tree = useCurrentTree()
  const { data: members } = useMembers(tree.id)
  const { data: me } = useMe()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const mine = (members ?? []).filter((m) => m.user.id === me?.id)
  const leave = useMutation({
    mutationFn: async () => {
      for (const m of mine) {
        await unwrap(
          api.DELETE('/api/trees/{tree_id}/members/{member_id}', {
            params: { path: { tree_id: tree.id, member_id: m.id } },
          }),
        )
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.trees })
      navigate('/')
    },
  })
  return (
    <div className="card form">
      <Label>Leave this tree</Label>
      <p className="muted small">You’ll need a new invite to rejoin.</p>
      <ErrorText error={leave.error} />
      <div className="actions">
        <button
          className="btn btn-danger"
          disabled={!mine.length}
          onClick={() => confirm(`Leave “${tree.name}”?`) && leave.mutate()}
        >
          <SignOut size={16} /> Leave tree
        </button>
      </div>
    </div>
  )
}
