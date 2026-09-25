import { Check, Copy, LinkSimple, Trash, UserPlus } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ASSIGNABLE_ROLES, type Invite, type Member, ROLE_INFO, type Schemas, unwrap } from '../api/client'
import {
  useCurrentTree,
  useInvalidateTree,
  useInvites,
  useMe,
  useMembers,
  usePeople,
  useSubtrees,
} from '../api/hooks'
import { Avatar, ErrorText, Field, Label, Loading, PageHeader, Reveal, RoleBadge, YouTag } from '../components/ui'
import { staggerIndex } from '../lib/format'

type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export default function MembersTab() {
  const tree = useCurrentTree()
  const { access } = tree
  const { data: members, isLoading, error } = useMembers(tree.id)
  const { data: me } = useMe()
  const [inviting, setInviting] = useState(false)
  const branchAdminOf = new Set(access.subtree_roles.filter((s) => s.role === 'admin').map((s) => s.subtree_id))
  const isTreeAdmin = access.tree_role === 'admin' || access.tree_role === 'owner'
  const canManage = (subtreeId: string | null) =>
    isTreeAdmin || (subtreeId !== null && branchAdminOf.has(subtreeId))

  return (
    <>
      <PageHeader
        kicker={tree.name}
        title="Members"
        lede="Everyone who can open this tree, and what each of them can do."
        actions={
          access.can_manage_members &&
          !inviting && (
            <button className="btn" onClick={() => setInviting(true)}>
              <UserPlus size={16} /> Invite someone
            </button>
          )
        }
      />

      {access.can_manage_members && inviting && <InvitePanel onClose={() => setInviting(false)} />}

      <ErrorText error={error} />
      {isLoading ? (
        <Loading rows={4} />
      ) : (
        <div className="card card-flush">
          <ul className="rows stagger">
            {members?.map((m, i) => (
              <MemberRow
                key={m.id}
                index={i}
                treeId={tree.id}
                member={m}
                canManage={m.role !== 'owner' && canManage(m.subtree_id)}
                isMe={m.user.id === me?.id}
              />
            ))}
          </ul>
        </div>
      )}

      {access.can_manage_members && <PendingInvites />}
    </>
  )
}

function MemberRow({
  treeId,
  member,
  canManage,
  isMe,
  index,
}: {
  treeId: string
  member: Member
  canManage: boolean
  isMe: boolean
  index: number
}) {
  const invalidate = useInvalidateTree()
  const path = { tree_id: treeId, member_id: member.id }
  const update = useMutation({
    mutationFn: (role: AssignableRole) =>
      unwrap(api.PATCH('/api/trees/{tree_id}/members/{member_id}', { params: { path }, body: { role } })),
    onSuccess: () => invalidate(treeId),
  })
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/trees/{tree_id}/members/{member_id}', { params: { path } })),
    onSuccess: () => invalidate(treeId),
  })
  const name = member.user.display_name || member.user.email

  return (
    <li style={staggerIndex(index)}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Avatar name={name} me={isMe} />
        <div className="grow">
          <div className="row-title">
            {name}
            {isMe && <YouTag />}
          </div>
          <div className="row-sub">
            <span className="mono">{member.user.email}</span> ·{' '}
            {member.subtree_name ? `Branch: ${member.subtree_name}` : 'Whole tree'}
          </div>
          <ErrorText error={update.error ?? remove.error} />
        </div>
        {canManage ? (
          <div className="actions" style={{ flexWrap: 'nowrap' }}>
            <select
              aria-label={`Role for ${name}`}
              value={member.role}
              onChange={(e) => update.mutate(e.target.value as AssignableRole)}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_INFO[r].label}
                </option>
              ))}
            </select>
            <button
              className="btn btn-ghost btn-sm btn-icon"
              aria-label={`Remove ${name}`}
              title="Remove"
              onClick={() => {
                if (confirm(`Remove ${member.user.email} from ${member.subtree_name ?? 'this tree'}?`)) remove.mutate()
              }}
            >
              <Trash size={15} />
            </button>
          </div>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </div>
    </li>
  )
}

function InvitePanel({ onClose }: { onClose: () => void }) {
  const tree = useCurrentTree()
  const { access } = tree
  const isTreeAdmin = access.tree_role === 'admin' || access.tree_role === 'owner'
  const { data: subtrees } = useSubtrees(tree.id)
  const { data: people } = usePeople(tree.id)
  const invalidate = useInvalidateTree()

  const branchOptions = (subtrees ?? []).filter(
    (s) => isTreeAdmin || access.subtree_roles.some((r) => r.subtree_id === s.id && r.role === 'admin'),
  )
  const [role, setRole] = useState<AssignableRole>('contributor')
  const [chosenSubtree, setSubtreeId] = useState('')
  // Branch-only admins can't invite to the whole tree, so default to their first branch.
  const subtreeId = chosenSubtree || (isTreeAdmin ? '' : (branchOptions[0]?.id ?? ''))
  const [email, setEmail] = useState('')
  const [personId, setPersonId] = useState('')
  const [created, setCreated] = useState<Invite | null>(null)

  const create = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/trees/{tree_id}/invites', {
          params: { path: { tree_id: tree.id } },
          body: { role, subtree_id: subtreeId || null, email: email || null, person_id: personId || null },
        }),
      ),
    onSuccess: (inv) => {
      setCreated(inv)
      setEmail('')
      setPersonId('')
      invalidate(tree.id)
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
      <div className="form-head">
        <h2 className="card-title">Invite someone</h2>
        <p className="muted small">Create a link and send it to them yourself. It works once and expires in 14 days.</p>
      </div>
      <div className="grid-2">
        <Field label="Role" hint={ROLE_INFO[role].description}>
          <select value={role} onChange={(e) => setRole(e.target.value as AssignableRole)}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_INFO[r].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Access to">
          <select value={subtreeId} onChange={(e) => setSubtreeId(e.target.value)}>
            {isTreeAdmin && <option value="">Whole tree</option>}
            {branchOptions.map((s) => (
              <option key={s.id} value={s.id}>
                Branch: {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Their email" hint="Optional. If set, only this address can accept.">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="They are" hint="Optional. Links their account to their profile.">
          <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Not in the tree yet</option>
            {(people ?? [])
              .filter((p) => !p.linked_user_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <ErrorText error={create.error} />
      {created && <InviteLink invite={created} />}
      <div className="actions">
        <button className="btn" disabled={create.isPending || (!isTreeAdmin && !subtreeId)}>
          <LinkSimple size={16} /> Create invite link
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {created ? 'Done' : 'Cancel'}
        </button>
      </div>
    </form>
  )
}

function inviteUrl(invite: Invite) {
  return `${window.location.origin}/invite/${invite.token}`
}

function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : label}
    </button>
  )
}

function InviteLink({ invite }: { invite: Invite }) {
  const url = inviteUrl(invite)
  return (
    <div className="invite-link">
      <code>{url}</code>
      <CopyButton text={url} label="Copy" />
    </div>
  )
}

function PendingInvites() {
  const tree = useCurrentTree()
  const { data: invites } = useInvites(tree.id, true)
  const { data: subtrees } = useSubtrees(tree.id)
  if (!invites?.length) return null
  return (
    <Reveal>
      <section className="section">
        <Label>Pending invites</Label>
        <div className="card card-flush">
          <ul className="rows">
            {invites.map((i) => (
              <PendingInvite key={i.id} treeId={tree.id} invite={i} subtrees={subtrees ?? []} />
            ))}
          </ul>
        </div>
      </section>
    </Reveal>
  )
}

function PendingInvite({
  treeId,
  invite,
  subtrees,
}: {
  treeId: string
  invite: Invite
  subtrees: Schemas['SubtreeOut'][]
}) {
  const invalidate = useInvalidateTree()
  const revoke = useMutation({
    mutationFn: () =>
      unwrap(
        api.DELETE('/api/trees/{tree_id}/invites/{invite_id}', {
          params: { path: { tree_id: treeId, invite_id: invite.id } },
        }),
      ),
    onSuccess: () => invalidate(treeId),
  })
  const branch = subtrees.find((s) => s.id === invite.subtree_id)?.name
  return (
    <li>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="grow">
          <div className="row-title">
            {invite.email ?? 'Anyone with the link'} <RoleBadge role={invite.role} />
          </div>
          <div className="row-sub">
            {branch ? `Branch: ${branch}` : 'Whole tree'} ·{' '}
            <span className="mono">expires {new Date(invite.expires_at).toLocaleDateString()}</span>
          </div>
          <ErrorText error={revoke.error} />
        </div>
        <div className="actions" style={{ flexWrap: 'nowrap' }}>
          <CopyButton text={inviteUrl(invite)} />
          <button className="btn btn-ghost btn-sm" onClick={() => revoke.mutate()}>
            Revoke
          </button>
        </div>
      </div>
    </li>
  )
}
