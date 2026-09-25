import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { api, ROLE_INFO, unwrap } from '../api/client'
import { keys } from '../api/hooks'
import { ErrorText, Loading, RoleBadge } from '../components/ui'

export default function InvitePage() {
  const token = useParams().token!
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: invite, error, isLoading } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => unwrap(api.GET('/api/invites/{token}', { params: { path: { token } } })),
  })
  const accept = useMutation({
    mutationFn: () => unwrap(api.POST('/api/invites/{token}/accept', { params: { path: { token } } })),
    onSuccess: ({ tree_id }) => {
      qc.invalidateQueries({ queryKey: keys.trees })
      navigate(`/trees/${tree_id}`)
    },
  })

  if (isLoading) return <Loading rows={1} />
  if (error || !invite) return <ErrorText error={error ?? 'Invite not found'} />

  return (
    <div className="card form page-enter" style={{ maxWidth: 520, margin: '4vh auto 0', padding: 32 }}>
      <div>
        <p className="kicker">Invitation</p>
        <h1 style={{ fontSize: '2.1rem' }}>Join {invite.tree_name}</h1>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <p>
          {invite.subtree_name ? (
            <>
              You’re invited to the <strong>{invite.subtree_name}</strong> branch as{' '}
            </>
          ) : (
            <>You’re invited to the whole tree as </>
          )}
          <RoleBadge role={invite.role} />
        </p>
        <p className="muted small">{ROLE_INFO[invite.role].description}.</p>
        {invite.person_name && (
          <p className="muted small">
            Your account will be linked to <strong>{invite.person_name}</strong> in the tree.
          </p>
        )}
      </div>
      {invite.usable ? (
        <div className="actions">
          <button className="btn" disabled={accept.isPending} onClick={() => accept.mutate()}>
            Accept invite
          </button>
        </div>
      ) : (
        <ErrorText error="This invite has expired or has already been used. Ask for a new one." />
      )}
      <ErrorText error={accept.error} />
    </div>
  )
}
