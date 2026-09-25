import {
  ArrowSquareOut,
  Basketball,
  BookOpen,
  FilmSlate,
  ForkKnife,
  type Icon,
  MapPin,
  MusicNotes,
  PawPrint,
  Plus,
  PuzzlePiece,
  Star,
} from '@phosphor-icons/react'
import type { PersonDetail, Schemas } from '../api/client'
import { zodiac } from '../lib/dates'
import { linkLabel, linkText } from '../lib/genealogy'
import { Label } from './ui'

const FAVORITE_ICON: Record<string, Icon> = {
  food: ForkKnife,
  film: FilmSlate,
  movie: FilmSlate,
  music: MusicNotes,
  hobby: PuzzlePiece,
  book: BookOpen,
  place: MapPin,
  sport: Basketball,
}

/** Born, died, zodiac, career and other one-line facts. */
export function DetailsCard({ person, onAddBirth }: { person: PersonDetail; onAddBirth?: () => void }) {
  const describe = (v?: Schemas['VitalOut'] | null) =>
    v ? [v.date?.label, v.place].filter(Boolean).join(' · ') || 'Date not known' : null
  const facts: [string, string | null][] = [
    ['Born', describe(person.birth)],
    ['Died', describe(person.death)],
    ['Zodiac', zodiac(person.birth?.date)],
    ['Career', person.occupation || null],
    ['Nationality', person.nationality || null],
    ['Education', person.education || null],
    ['Vehicles', person.vehicles.join(', ') || null],
  ]
  const shown = facts.filter(([, v]) => v)

  return (
    <section className="card">
      <Label>Details</Label>
      {shown.length ? (
        <dl className="facts">
          {shown.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted small">No details yet.</p>
      )}
      {onAddBirth && !person.birth && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 14, marginLeft: -10 }} onClick={onAddBirth}>
          <Plus size={14} /> Add birth date
        </button>
      )}
    </section>
  )
}

export function Links({ links }: { links: PersonDetail['links'] }) {
  if (!links.length) return null
  return (
    <ul className="chips">
      {links.map((l) => (
        <li key={l.url}>
          <a className="chip" href={l.url} target="_blank" rel="noopener noreferrer">
            <span>{linkText(l.url)}</span>
            <span className="muted">{linkLabel(l.url, l.label)}</span>
            <ArrowSquareOut size={13} className="muted" />
          </a>
        </li>
      ))}
    </ul>
  )
}

export function FavoritesCard({ person }: { person: PersonDetail }) {
  if (!person.favorites.length) return null
  return (
    <section className="card">
      <Label>Favourites</Label>
      <ul className="tiles">
        {person.favorites.map((f, i) => {
          const Glyph = FAVORITE_ICON[f.category.toLowerCase()] ?? Star
          return (
            <li key={`${f.category}-${i}`} className="tile">
              <span className="tile-label">
                <Glyph size={14} /> {f.category}
              </span>
              <span className="tile-value">{f.value}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function PetsCard({ person }: { person: PersonDetail }) {
  if (!person.pets.length) return null
  return (
    <section className="card">
      <Label>Pets</Label>
      <ul className="plain" style={{ gap: 14 }}>
        {person.pets.map((p, i) => (
          <li key={`${p.name}-${i}`} className="pet">
            <span className="pet-icon" aria-hidden="true">
              <PawPrint size={17} />
            </span>
            <span>
              <span className="pet-name">{p.name}</span>
              {p.kind && <span className="muted small"> · {p.kind}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
