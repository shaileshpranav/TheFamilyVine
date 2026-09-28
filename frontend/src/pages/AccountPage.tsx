import { CaretRight, SquaresFour } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { useMe } from '../api/hooks'
import AccountCard from '../components/AccountCard'
import SettingsCard from '../components/SettingsCard'
import { PageHeader, Reveal } from '../components/ui'

export default function AccountPage() {
  const { data: me } = useMe()
  return (
    <>
      <PageHeader kicker="Account" title={me?.display_name || 'Your account'} />
      <div className="bento">
        <Reveal className="span-4">
          <AccountCard />
        </Reveal>
        <Reveal className="span-2" delay={80}>
          <Link to="/" className="card card-link" style={{ height: '100%' }}>
            <SquaresFour size={20} />
            <p className="card-title" style={{ marginTop: 14 }}>
              Your trees
            </p>
            <div className="card-foot">
              Open a tree <CaretRight size={13} />
            </div>
          </Link>
        </Reveal>
        <Reveal className="span-6" delay={160}>
          <SettingsCard />
        </Reveal>
      </div>
    </>
  )
}
