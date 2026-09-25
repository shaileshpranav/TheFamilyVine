import { useCurrentTree, useMe } from '../api/hooks'
import AccountCard from '../components/AccountCard'
import { AccessCard, TreeLinksCard, YourProfileCard } from '../components/TreeCards'
import { PageHeader, Reveal } from '../components/ui'

/** "You" within a tree: your profile, what you can do here, and your account. */
export default function YouPage() {
  const tree = useCurrentTree()
  const { data: me } = useMe()

  return (
    <>
      <PageHeader kicker={tree.name} title={me?.display_name || 'You'} lede="Your profile, your access and your account." />
      <div className="bento">
        <Reveal className="span-3">
          <YourProfileCard tree={tree} />
        </Reveal>
        <Reveal className="span-3" delay={80}>
          <AccessCard tree={tree} />
        </Reveal>
        <Reveal className="span-3" delay={120}>
          <TreeLinksCard tree={tree} withSwitch />
        </Reveal>
        <Reveal className="span-3" delay={160}>
          <AccountCard />
        </Reveal>
      </div>
    </>
  )
}
