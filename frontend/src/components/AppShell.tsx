import {
  CaretUpDown,
  Check,
  GearSix,
  GitBranch,
  House,
  type Icon,
  Plus,
  SquaresFour,
  UserCircle,
  Users,
  UsersThree,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router'
import { ROLE_INFO, type Role, type Tree } from '../api/client'
import { useMe, useTree, useTrees } from '../api/hooks'
import { exitPreview, previewRole } from '../preview'
import { Avatar } from './ui'

interface NavItem {
  to: string
  label: string
  icon: Icon
  end?: boolean
}

function treeNav(treeId: string): { main: NavItem[]; manage: NavItem[] } {
  const base = `/trees/${treeId}`
  return {
    main: [
      { to: base, label: 'Home', icon: House, end: true },
      { to: `${base}/people`, label: 'People', icon: UsersThree },
    ],
    manage: [
      { to: `${base}/branches`, label: 'Branches', icon: GitBranch },
      { to: `${base}/members`, label: 'Members', icon: Users },
      { to: `${base}/settings`, label: 'Settings', icon: GearSix },
    ],
  }
}

export default function AppShell() {
  const treeId = useMatch('/trees/:treeId/*')?.params.treeId
  const { data: tree } = useTree(treeId)
  const { data: me } = useMe()
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const youPath = treeId ? `/trees/${treeId}/you` : '/account'
  const nav = treeId ? treeNav(treeId) : null
  const myName = me?.display_name || me?.email || 'You'

  return (
    <div className="app">
      <div className="ambient" aria-hidden="true" />
      <div className="shell">
        <aside className="sidebar" aria-label="Main">
          <Link to="/" className="brand">
            <img src="/favicon.svg" alt="" width={24} height={24} />
            Family Tree
          </Link>
          <TreeSwitcher current={tree} />
          {nav ? (
            <>
              <nav className="stack" style={{ gap: 2, marginTop: 14 }} aria-label="Tree">
                {nav.main.map((item) => (
                  <SideLink key={item.to} {...item} />
                ))}
              </nav>
              <p className="side-section">Manage</p>
              <nav className="stack" style={{ gap: 2 }} aria-label="Manage">
                {nav.manage.map((item) => (
                  <SideLink key={item.to} {...item} />
                ))}
              </nav>
            </>
          ) : (
            <nav className="stack" style={{ gap: 2, marginTop: 14 }}>
              <SideLink to="/" label="Your trees" icon={SquaresFour} end />
            </nav>
          )}
          <div className="side-foot">
            <NavLink to={youPath} className={({ isActive }) => `side-user${isActive ? ' active' : ''}`}>
              <Avatar name={myName} size="sm" me />
              <div className="grow">
                <div className="side-user-name">{myName}</div>
                <div className="side-user-sub">{treeId ? 'You in this tree' : 'Account'}</div>
              </div>
            </NavLink>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <Link to={treeId ? `/trees/${treeId}` : '/'} className="topbar-title">
              <img src="/favicon.svg" alt="" width={22} height={22} />
              <span>{tree?.name ?? 'Family Tree'}</span>
            </Link>
            {treeId && (
              <Link to="/" className="btn btn-ghost btn-sm">
                All trees
              </Link>
            )}
            {!treeId && (
              <Link to={youPath} aria-label="Account">
                <Avatar name={myName} size="sm" me />
              </Link>
            )}
          </header>
          {/* Keyed by path so page state (e.g. an open edit form) resets when moving between people. */}
          <main className="page" key={pathname}>
            <Outlet />
          </main>
        </div>
      </div>

      {treeId && <TabBar treeId={treeId} youPath={youPath} />}
      {import.meta.env.DEV && previewRole && <PreviewBadge role={previewRole} />}
    </div>
  )
}

function SideLink({ to, label, icon: Glyph, end }: NavItem) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
      <Glyph size={17} />
      <span>{label}</span>
    </NavLink>
  )
}

function TreeSwitcher({ current }: { current?: Tree }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data: trees } = useTrees()

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => setOpen(false)
  return (
    <div className="switcher" ref={ref}>
      <button
        type="button"
        className="switcher-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{current?.name ?? 'Choose a tree'}</span>
        <CaretUpDown size={14} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {trees?.map((t) => (
            <Link
              key={t.id}
              to={`/trees/${t.id}`}
              role="menuitem"
              className={`menu-item${t.id === current?.id ? ' current' : ''}`}
              onClick={close}
            >
              <span className="grow">{t.name}</span>
              {t.id === current?.id && <Check size={14} />}
            </Link>
          ))}
          {trees && trees.length > 0 && <div className="menu-sep" />}
          <Link to="/" role="menuitem" className="menu-item" onClick={close}>
            <SquaresFour size={15} /> All trees
          </Link>
          <Link to="/?new=1" role="menuitem" className="menu-item" onClick={close}>
            <Plus size={15} /> Start a new tree
          </Link>
        </div>
      )}
    </div>
  )
}

function TabBar({ treeId, youPath }: { treeId: string; youPath: string }) {
  const items: NavItem[] = [
    { to: `/trees/${treeId}`, label: 'Home', icon: House, end: true },
    { to: `/trees/${treeId}/people`, label: 'People', icon: UsersThree },
    { to: youPath, label: 'You', icon: UserCircle },
  ]
  return (
    <nav className="tabbar" aria-label="Sections">
      {items.map(({ to, label, icon: Glyph, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab-item${isActive ? ' active' : ''}`}>
          {({ isActive }) => (
            <>
              <Glyph size={22} weight={isActive ? 'fill' : 'bold'} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function PreviewBadge({ role }: { role: Role }) {
  return (
    <div className="preview-badge" role="status">
      <span>
        Preview data · viewing as {ROLE_INFO[role].label.toLowerCase()}
      </span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={exitPreview}>
        Exit
      </button>
    </div>
  )
}
