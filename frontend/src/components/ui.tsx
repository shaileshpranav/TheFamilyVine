import { WarningCircle } from '@phosphor-icons/react'
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { ROLE_INFO, type Role } from '../api/client'
import { initialsOf } from '../lib/format'

type Tone = 'gray' | 'red' | 'blue' | 'green' | 'yellow' | 'ink'

const ROLE_TONE: Record<Role, Tone> = {
  owner: 'yellow',
  admin: 'blue',
  contributor: 'green',
  personal: 'gray',
}

export function Tag({ tone = 'gray', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <span className={`tag tag-${tone}`} title={title}>
      {children}
    </span>
  )
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <Tag tone={ROLE_TONE[role]} title={ROLE_INFO[role].description}>
      {ROLE_INFO[role].label}
    </Tag>
  )
}

export function LivingBadge({ living }: { living: boolean }) {
  return living ? <Tag tone="green">Living</Tag> : <Tag>Deceased</Tag>
}

export function YouTag() {
  return <Tag tone="ink">You</Tag>
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <p className="error" role="alert">
      <WarningCircle size={16} />
      <span>{msg}</span>
    </p>
  )
}

/** Placeholder rows shown while a list loads. */
export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card card-flush" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton skeleton-avatar" />
          <div className="grow stack" style={{ gap: 8 }}>
            <div className="skeleton" style={{ width: `${46 - i * 7}%` }} />
            <div className="skeleton" style={{ width: `${28 - i * 4}%`, opacity: 0.7 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** A small continuous-line sketch of a branching tree over a pale circle. */
function Sprout() {
  return (
    <svg width="120" height="96" viewBox="0 0 120 96" fill="none" aria-hidden="true">
      <circle className="ill-fill" cx="72" cy="40" r="28" />
      <g className="ill-line" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M60 90c-.8-9 .9-17.5.2-26.5-.4-5.2-.1-9.6.4-13.8" />
        <path d="M60.3 58.5c-6.8-5.6-13-8.6-20.6-10.4" />
        <path d="M60.8 52c5.3-6.2 12.1-10.1 20.4-11.9" />
        <path d="M60.4 70.2c4.6-2.4 9.3-3.3 14.6-3" />
        <circle cx="35.5" cy="46.8" r="5.4" />
        <circle cx="86.2" cy="39" r="5.4" />
        <circle cx="61.2" cy="43.6" r="5.4" />
        <circle cx="79.8" cy="67.4" r="4.4" />
        <path d="M46 90.5c9.6-1 19.4-1.1 29.2-.2" />
      </g>
    </svg>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Sprout />
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
      {action && <div className="actions">{action}</div>}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

/** Someone's profile photo, or their initials when they don't have one. */
export function Avatar({
  name,
  size = 'md',
  me = false,
  deceased = false,
  photo,
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
  me?: boolean
  deceased?: boolean
  /** The image's URL (see lib/photos). */
  photo?: string | null
}) {
  const cls = [
    'avatar',
    size !== 'md' && `avatar-${size}`,
    me && 'avatar-me',
    deceased && !me && 'avatar-deceased',
    photo && 'avatar-photo',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls} aria-hidden="true">
      {photo ? <img src={photo} alt="" loading="lazy" /> : initialsOf(name)}
    </span>
  )
}

export function PageHeader({
  kicker,
  title,
  lede,
  actions,
}: {
  kicker?: ReactNode
  title: ReactNode
  lede?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="page-head page-enter">
      <div className="page-head-text">
        {kicker && <p className="kicker">{kicker}</p>}
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

/** Fades its content up once it scrolls into view. */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -32px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={{ '--delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  )
}

export function Label({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="label">
      {icon}
      {children}
    </p>
  )
}
