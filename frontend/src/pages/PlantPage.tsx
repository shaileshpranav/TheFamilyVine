import { ArrowRight, LinkSimple } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, type Invite, type PersonDetail, ROLE_INFO, type Schemas, unwrap } from '../api/client'
import { keys, useTrees } from '../api/hooks'
import { InviteLink } from '../components/InviteLink'
import { Avatar, ErrorText, Field } from '../components/ui'
import { yearDate } from '../lib/dates'

type Sex = Schemas['Sex']
type Planted = { treeId: string; me: PersonDetail }

const PRONOUNS: [Sex, string][] = [
  ['female', 'She'],
  ['male', 'He'],
  ['other', 'They'],
]

/** "Plant your family tree": a new tree, started with yourself, then your parents and family. */
export default function PlantPage() {
  const [planted, setPlanted] = useState<Planted | null>(null)
  const [step, setStep] = useState(1)
  return (
    <div className="plant page-enter">
      <p className="kicker">Step {step} of 3</p>
      {step === 1 && (
        <PlantYou
          onDone={(p) => {
            setPlanted(p)
            setStep(2)
          }}
        />
      )}
      {step === 2 && planted && <AddParents planted={planted} onDone={() => setStep(3)} />}
      {step === 3 && planted && <InviteFamily treeId={planted.treeId} />}
    </div>
  )
}

function Pronouns({ value, onChange, label }: { value: Sex; onChange: (s: Sex) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {PRONOUNS.map(([sex, word]) => (
        <button
          key={sex}
          type="button"
          role="radio"
          aria-checked={value === sex}
          className={`seg-opt${value === sex ? ' on' : ''}`}
          onClick={() => onChange(sex)}
        >
          {word}
        </button>
      ))}
    </div>
  )
}

function PlantYou({ onDone }: { onDone: (p: Planted) => void }) {
  const qc = useQueryClient()
  const { data: trees } = useTrees()
  const [you, setYou] = useState({ given_names: '', surname: '', year: '', sex: 'female' as Sex })
  const [treeName, setTreeName] = useState<string | null>(null)
  const name = [you.given_names, you.surname].filter(Boolean).join(' ')
  const suggested = you.surname ? `The ${you.surname} Family` : ''

  const plant = useMutation({
    mutationFn: async () => {
      const tree = await unwrap(api.POST('/api/trees', { body: { name: (treeName ?? suggested) || `${name}’s family` } }))
      const me = await unwrap(
        api.POST('/api/trees/{tree_id}/people', {
          params: { path: { tree_id: tree.id } },
          body: {
            given_names: you.given_names,
            surname: you.surname,
            sex: you.sex,
            is_me: true,
            birth: yearDate(you.year),
          },
        }),
      )
      return { treeId: tree.id, me }
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: keys.trees })
      onDone(p)
    },
  })

  return (
    <form
      className="plant-form"
      onSubmit={(e) => {
        e.preventDefault()
        plant.mutate()
      }}
    >
      <h1>Plant your family tree</h1>
      <p className="lede">Start with yourself. You’ll be the first branch, and everyone else grows out from here.</p>

      <div className="plant-seed" aria-hidden="true">
        <Avatar name={name || '?'} size="lg" me />
        <div>
          <p className="plant-seed-name">{name || 'Your name'}</p>
          <p className="mono muted small">{you.year ? `b. ${you.year}` : 'Born …'}</p>
        </div>
      </div>

      <div className="card form">
        <div className="grid-2">
          <Field label="Given names">
            <input autoFocus required value={you.given_names} onChange={(e) => setYou({ ...you, given_names: e.target.value })} />
          </Field>
          <Field label="Surname">
            <input value={you.surname} onChange={(e) => setYou({ ...you, surname: e.target.value })} />
          </Field>
          <Field label="Birth year" hint="Optional">
            <input
              inputMode="numeric"
              maxLength={4}
              placeholder="1989"
              value={you.year}
              onChange={(e) => setYou({ ...you, year: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <div className="field">
            <span className="field-label">You are</span>
            <Pronouns label="You are" value={you.sex} onChange={(sex) => setYou({ ...you, sex })} />
          </div>
          <Field label="Tree name" hint="You can change this later.">
            <input
              value={treeName ?? suggested}
              placeholder="The Hollis Family"
              onChange={(e) => setTreeName(e.target.value)}
            />
          </Field>
        </div>
        <ErrorText error={plant.error} />
        <div className="actions">
          <button className="btn" disabled={plant.isPending || !you.given_names.trim()}>
            Plant the tree
          </button>
          {!!trees?.length && (
            <Link to="/" className="btn btn-ghost">
              Cancel
            </Link>
          )}
        </div>
      </div>
    </form>
  )
}

interface Parent {
  given_names: string
  surname: string
  year: string
  sex: Sex
  living: boolean
}

function AddParents({ planted, onDone }: { planted: Planted; onDone: () => void }) {
  const qc = useQueryClient()
  const blank = (sex: Sex): Parent => ({ given_names: '', surname: planted.me.surname, year: '', sex, living: true })
  const [parents, setParents] = useState<Parent[]>([blank('female'), blank('male')])
  const named = parents.filter((p) => p.given_names.trim())
  const set = (i: number, change: Partial<Parent>) =>
    setParents((ps) => ps.map((p, j) => (j === i ? { ...p, ...change } : p)))

  const add = useMutation({
    mutationFn: async () => {
      // One at a time: the second joins the first as the other parent, so they're a couple.
      for (const p of named) {
        await unwrap(
          api.POST('/api/trees/{tree_id}/people', {
            params: { path: { tree_id: planted.treeId } },
            body: {
              given_names: p.given_names,
              surname: p.surname,
              sex: p.sex,
              is_living: p.living,
              birth: yearDate(p.year),
              relative: { person_id: planted.me.id, relation: 'parent' },
            },
          }),
        )
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree', planted.treeId] })
      onDone()
    },
  })

  return (
    <form
      className="plant-form"
      onSubmit={(e) => {
        e.preventDefault()
        add.mutate()
      }}
    >
      <h1>Add your parents</h1>
      <p className="lede">
        They give the tree its first roots. Leave either blank if you’d rather, and add more family any time.
      </p>
      {parents.map((p, i) => (
        <fieldset key={i} className="card form plant-parent">
          <legend className="sr-only">Parent {i + 1}</legend>
          <div className="grid-2">
            <Field label="Given names">
              <input autoFocus={i === 0} value={p.given_names} onChange={(e) => set(i, { given_names: e.target.value })} />
            </Field>
            <Field label="Surname">
              <input value={p.surname} onChange={(e) => set(i, { surname: e.target.value })} />
            </Field>
            <Field label="Birth year" hint="Optional">
              <input
                inputMode="numeric"
                maxLength={4}
                value={p.year}
                onChange={(e) => set(i, { year: e.target.value.replace(/\D/g, '') })}
              />
            </Field>
            <div className="field">
              <span className="field-label">They are</span>
              <Pronouns label={`Parent ${i + 1} is`} value={p.sex} onChange={(sex) => set(i, { sex })} />
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={!p.living} onChange={(e) => set(i, { living: !e.target.checked })} />
            No longer living
          </label>
        </fieldset>
      ))}
      <ErrorText error={add.error} />
      <div className="actions">
        <button className="btn" disabled={add.isPending || !named.length}>
          Add {named.length === 1 ? 'parent' : 'parents'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Skip for now
        </button>
      </div>
    </form>
  )
}

function InviteFamily({ treeId }: { treeId: string }) {
  const navigate = useNavigate()
  const [role, setRole] = useState<'contributor' | 'personal'>('contributor')
  const [links, setLinks] = useState<Invite[]>([])
  const create = useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/trees/{tree_id}/invites', { params: { path: { tree_id: treeId } }, body: { role } })),
    onSuccess: (invite) => setLinks((ls) => [invite, ...ls]),
  })

  return (
    <div className="plant-form">
      <h1>Invite your family</h1>
      <p className="lede">
        Send relatives a link so they can join, add what they know and watch the tree grow. Each link works once and
        expires in 14 days.
      </p>
      <div className="card form">
        <div className="field">
          <span className="field-label">They can</span>
          <div className="seg" role="radiogroup" aria-label="What they can do">
            {(['contributor', 'personal'] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                className={`seg-opt${role === r ? ' on' : ''}`}
                onClick={() => setRole(r)}
              >
                {ROLE_INFO[r].label}
              </button>
            ))}
          </div>
          <span className="field-hint">{ROLE_INFO[role].description}</span>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-secondary" disabled={create.isPending} onClick={() => create.mutate()}>
            <LinkSimple size={16} /> {links.length ? 'Create another link' : 'Create invite link'}
          </button>
        </div>
        <ErrorText error={create.error} />
        {links.map((invite) => (
          <InviteLink key={invite.id} invite={invite} />
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={() => navigate(`/trees/${treeId}/tree`)}>
          Open your tree <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
