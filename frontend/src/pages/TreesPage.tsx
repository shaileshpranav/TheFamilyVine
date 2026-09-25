import { ArrowRight, Plus } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, unwrap } from '../api/client'
import { keys, useMe, useTrees } from '../api/hooks'
import { Empty, ErrorText, Field, Loading, PageHeader, RoleBadge } from '../components/ui'
import { staggerIndex } from '../lib/format'

export default function TreesPage() {
  const { data: me } = useMe()
  const { data: trees, isLoading, error } = useTrees()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(params.has('new'))
  const firstName = me?.display_name?.split(/\s+/)[0]

  function stopCreating() {
    setCreating(false)
    if (params.has('new')) setParams({}, { replace: true })
  }

  return (
    <>
      <PageHeader
        kicker={firstName ? `Welcome back, ${firstName}` : 'Welcome'}
        title="Your family trees"
        lede="Open a tree to see the people in it, or start a new one."
        actions={
          !creating && (
            <button className="btn" onClick={() => setCreating(true)}>
              <Plus size={16} /> Start a new tree
            </button>
          )
        }
      />

      {creating && <CreateTree onDone={stopCreating} />}
      <ErrorText error={error} />
      {isLoading ? (
        <Loading />
      ) : trees?.length ? (
        <ul className="grid-cards stagger">
          {trees.map((t, i) => (
            <li key={t.id} style={staggerIndex(i)}>
              <Link to={`/trees/${t.id}`} className="card card-link" style={{ height: '100%' }}>
                <div className="actions" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  <h2 className="card-title">{t.name}</h2>
                  <RoleBadge role={t.highest_role} />
                </div>
                {t.description && (
                  <p className="muted small" style={{ marginTop: 10 }}>
                    {t.description}
                  </p>
                )}
                <div className="card-foot">
                  Open <ArrowRight size={13} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        !creating && (
          <Empty
            title="No trees yet"
            action={
              <button className="btn" onClick={() => setCreating(true)}>
                <Plus size={16} /> Start a new tree
              </button>
            }
          >
            Start a tree of your own, or open an invite link a relative sent you.
          </Empty>
        )
      )}
    </>
  )
}

function CreateTree({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const qc = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: () => unwrap(api.POST('/api/trees', { body: { name, description } })),
    onSuccess: (tree) => {
      qc.invalidateQueries({ queryKey: keys.trees })
      navigate(`/trees/${tree.id}`)
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
        <h2 className="card-title">Start a new tree</h2>
        <p className="muted small">You’ll be its owner. You can invite relatives once it exists.</p>
      </div>
      <div className="grid-2">
        <Field label="Name">
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Hollis Family"
          />
        </Field>
        <Field label="Description" hint="Optional">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Four generations, from Leeds to Portland"
          />
        </Field>
      </div>
      <ErrorText error={create.error} />
      <div className="actions">
        <button className="btn" disabled={create.isPending}>
          Create tree
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}
