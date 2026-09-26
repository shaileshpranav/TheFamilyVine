import { SignOut } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { signOut } from 'supertokens-auth-react/recipe/session'
import { api, unwrap } from '../api/client'
import { keys, useMe } from '../api/hooks'
import { clearOfflineData } from '../lib/offline'
import { exitPreview, previewRole } from '../preview'
import { ErrorText, Label } from './ui'

export default function AccountCard() {
  const { data: me } = useMe()
  const [draft, setDraft] = useState<string | null>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const save = useMutation({
    mutationFn: (display_name: string) => unwrap(api.PATCH('/api/me', { body: { display_name } })),
    onSuccess: (user) => {
      qc.setQueryData(keys.me, user)
      qc.invalidateQueries({ queryKey: ['tree'] })
      setDraft(null)
    },
  })

  async function onSignOut() {
    if (import.meta.env.DEV && previewRole) return exitPreview()
    await clearOfflineData()
    await signOut()
    qc.clear()
    navigate('/auth')
  }

  const value = draft ?? me?.display_name ?? ''
  return (
    <div className="card form" style={{ height: '100%' }}>
      <div>
        <Label>Account</Label>
        <p className="muted small">
          Signed in as <span className="mono">{me?.email}</span>
        </p>
      </div>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft !== null) save.mutate(draft.trim())
        }}
      >
        <label className="field-label" htmlFor="display-name">
          Display name
        </label>
        <div className="actions" style={{ flexWrap: 'nowrap' }}>
          <input
            id="display-name"
            value={value}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn btn-secondary" disabled={draft === null || save.isPending}>
            Save
          </button>
        </div>
        <span className="field-hint">Shown to other members of your trees.</span>
      </form>
      <ErrorText error={save.error} />
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onSignOut}>
          <SignOut size={16} /> Sign out
        </button>
      </div>
    </div>
  )
}
