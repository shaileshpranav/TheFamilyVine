import { ArrowRight, Plus } from '@phosphor-icons/react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useMe, useTrees } from '../api/hooks'
import { Empty, ErrorText, Loading, PageHeader, RoleBadge } from '../components/ui'
import { staggerIndex } from '../lib/format'
import { treeLink } from '../lib/preferences'

export default function TreesPage() {
  const { data: me } = useMe()
  const { data: trees, isLoading, error } = useTrees()
  const [params] = useSearchParams()
  const firstName = me?.display_name?.split(/\s+/)[0]

  // Older "start a new tree" links (/?new=1) go to the guided set-up.
  if (params.has('new')) return <Navigate to="/plant" replace />

  return (
    <>
      <PageHeader
        kicker={firstName ? `Welcome back, ${firstName}` : 'Welcome'}
        title="Your family trees"
        lede="Open a tree to see the people in it, or start a new one."
        actions={
          !!trees?.length && (
            <Link to="/plant" className="btn">
              <Plus size={16} /> Start a new tree
            </Link>
          )
        }
      />

      <ErrorText error={error} />
      {isLoading ? (
        <Loading />
      ) : trees?.length ? (
        <ul className="grid-cards stagger">
          {trees.map((t, i) => (
            <li key={t.id} style={staggerIndex(i)}>
              <Link to={treeLink(t.id, me?.preferences)} className="card card-link" style={{ height: '100%' }}>
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
        <Empty
          title="No trees yet"
          action={
            <Link to="/plant" className="btn">
              <Plus size={16} /> Plant your family tree
            </Link>
          }
        >
          Start one with yourself, a step at a time, or open an invite link a relative sent you.
        </Empty>
      )}
    </>
  )
}
