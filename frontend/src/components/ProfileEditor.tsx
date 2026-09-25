import { Plus, Trash, X } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { type ReactNode, useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type PersonDetail, type Schemas, unwrap } from '../api/client'
import { useInvalidateTree } from '../api/hooks'
import { FAVORITE_CATEGORIES } from '../lib/genealogy'
import { ErrorText, Field, Label } from './ui'

type Link = Schemas['SocialLink-Output']
type Pet = Schemas['Pet-Output']
type Favorite = Schemas['Favorite']

/** Edits everything on a profile except life events, which live in the timeline. */
export default function ProfileEditor({
  treeId,
  person,
  onDone,
}: {
  treeId: string
  person: PersonDetail
  onDone: () => void
}) {
  const [form, setForm] = useState({
    given_names: person.given_names,
    surname: person.surname,
    birth_surname: person.birth_surname,
    nickname: person.nickname,
    native_name: person.native_name,
    sex: person.sex,
    is_living: person.is_living,
    bio: person.bio,
    occupation: person.occupation,
    nationality: person.nationality,
    education: person.education,
  })
  const [links, setLinks] = useState<Link[]>(person.links)
  const [vehicles, setVehicles] = useState<string[]>(person.vehicles)
  const [pets, setPets] = useState<Pet[]>(person.pets)
  const [favorites, setFavorites] = useState<Favorite[]>(person.favorites)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const invalidate = useInvalidateTree()
  const navigate = useNavigate()
  const path = { tree_id: treeId, person_id: person.id }
  const favListId = useId()

  const save = useMutation({
    mutationFn: () => {
      const { is_living, ...rest } = form
      const body = {
        ...rest,
        ...(person.permissions.can_set_living ? { is_living } : {}),
        links: links.filter((l) => l.url.trim()),
        vehicles: vehicles.map((v) => v.trim()).filter(Boolean),
        pets: pets.filter((p) => p.name.trim()),
        favorites: favorites.filter((f) => f.category.trim() && f.value.trim()),
      }
      return unwrap(api.PATCH('/api/trees/{tree_id}/people/{person_id}', { params: { path }, body }))
    },
    onSuccess: () => {
      invalidate(treeId)
      onDone()
    },
  })
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/trees/{tree_id}/people/{person_id}', { params: { path } })),
    onSuccess: () => {
      invalidate(treeId)
      navigate('..', { relative: 'path' })
    },
  })

  return (
    <form
      className="card form page-enter"
      style={{ marginBottom: 32 }}
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <h2 className="card-title">Edit {person.display_name}</h2>

      <Label>Names</Label>
      <div className="grid-2">
        <Field label="Given names">
          <input value={form.given_names} onChange={(e) => set('given_names', e.target.value)} />
        </Field>
        <Field label="Surname">
          <input value={form.surname} onChange={(e) => set('surname', e.target.value)} />
        </Field>
        <Field label="Birth surname">
          <input value={form.birth_surname} onChange={(e) => set('birth_surname', e.target.value)} />
        </Field>
        <Field label="Nickname">
          <input value={form.nickname} onChange={(e) => set('nickname', e.target.value)} />
        </Field>
        <Field label="Name in native script">
          <input value={form.native_name} onChange={(e) => set('native_name', e.target.value)} />
        </Field>
        <Field label="Sex">
          <select value={form.sex} onChange={(e) => set('sex', e.target.value as Schemas['Sex'])}>
            <option value="unknown">Unknown</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Status" hint={person.permissions.can_set_living ? undefined : 'Only admins can change this'}>
          <select
            disabled={!person.permissions.can_set_living}
            value={form.is_living ? 'living' : 'deceased'}
            onChange={(e) => set('is_living', e.target.value === 'living')}
          >
            <option value="living">Living</option>
            <option value="deceased">Deceased</option>
          </select>
        </Field>
      </div>

      <Label>About</Label>
      <Field label="Short biography">
        <textarea rows={4} value={form.bio} onChange={(e) => set('bio', e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Career">
          <input value={form.occupation} placeholder="Carpenter at Hollis & Co." onChange={(e) => set('occupation', e.target.value)} />
        </Field>
        <Field label="Nationality">
          <input value={form.nationality} placeholder="Irish-American" onChange={(e) => set('nationality', e.target.value)} />
        </Field>
        <Field label="Education">
          <input value={form.education} placeholder="B.Ed, Boston College" onChange={(e) => set('education', e.target.value)} />
        </Field>
      </div>

      <ListEditor
        label="Links"
        hint="Social profiles or websites, such as instagram.com/yourname"
        addLabel="Add link"
        items={links}
        onChange={setLinks}
        blank={{ url: '', label: '' }}
        render={(l, update) => (
          <>
            <input aria-label="Web address" placeholder="instagram.com/elliehollis" value={l.url} onChange={(e) => update({ ...l, url: e.target.value })} />
            <input aria-label="Label" placeholder="Label (optional)" value={l.label} onChange={(e) => update({ ...l, label: e.target.value })} />
          </>
        )}
      />

      <ListEditor
        label="Vehicles"
        addLabel="Add vehicle"
        items={vehicles}
        onChange={setVehicles}
        blank=""
        render={(v, update) => (
          <input aria-label="Vehicle" placeholder="1962 Ford Falcon" value={v} onChange={(e) => update(e.target.value)} />
        )}
      />

      <ListEditor
        label="Pets"
        addLabel="Add pet"
        items={pets}
        onChange={setPets}
        blank={{ name: '', kind: '' }}
        render={(p, update) => (
          <>
            <input aria-label="Pet's name" placeholder="Name" value={p.name} onChange={(e) => update({ ...p, name: e.target.value })} />
            <input aria-label="Kind of animal" placeholder="Golden Retriever" value={p.kind} onChange={(e) => update({ ...p, kind: e.target.value })} />
          </>
        )}
      />

      <ListEditor
        label="Favourites"
        hint="Pick a category or type your own"
        addLabel="Add favourite"
        items={favorites}
        onChange={setFavorites}
        blank={{ category: '', value: '' }}
        render={(f, update) => (
          <>
            <input
              aria-label="Category"
              list={favListId}
              placeholder="Food"
              value={f.category}
              onChange={(e) => update({ ...f, category: e.target.value })}
            />
            <input aria-label="Favourite" placeholder="Thai green curry" value={f.value} onChange={(e) => update({ ...f, value: e.target.value })} />
          </>
        )}
      />
      <datalist id={favListId}>
        {FAVORITE_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <ErrorText error={save.error ?? remove.error} />
      <div className="actions">
        <button className="btn" disabled={save.isPending}>
          Save
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        {person.permissions.can_delete && (
          <button
            type="button"
            className="btn btn-danger push-right"
            onClick={() => {
              if (confirm(`Delete ${person.display_name}? Their relationships and events are removed too.`))
                remove.mutate()
            }}
          >
            <Trash size={16} /> Delete person
          </button>
        )}
      </div>
    </form>
  )
}

function ListEditor<T>({
  label,
  hint,
  addLabel,
  items,
  onChange,
  blank,
  render,
}: {
  label: string
  hint?: string
  addLabel: string
  items: T[]
  onChange: (items: T[]) => void
  blank: T
  render: (item: T, update: (next: T) => void) => ReactNode
}) {
  return (
    <fieldset className="field list-editor">
      <legend className="field-label">{label}</legend>
      {hint && <span className="field-hint">{hint}</span>}
      {items.map((item, i) => (
        <div className="list-editor-row" key={i}>
          {render(item, (next) => onChange(items.map((x, j) => (j === i ? next : x))))}
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label={`Remove from ${label.toLowerCase()}`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }} onClick={() => onChange([...items, blank])}>
          <Plus size={14} /> {addLabel}
        </button>
      </div>
    </fieldset>
  )
}
