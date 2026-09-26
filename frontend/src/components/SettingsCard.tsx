import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'
import { api, type Schemas, unwrap } from '../api/client'
import { keys, useMe } from '../api/hooks'
import { applyPreferences, DEFAULT_PREFERENCES, type Preferences } from '../lib/preferences'
import { ErrorText, Label } from './ui'

type Choice<K extends keyof Preferences> = [Preferences[K], string]

/** App settings, saved to the account as soon as they change so they follow you anywhere. */
export default function SettingsCard() {
  const { data: me } = useMe()
  const qc = useQueryClient()
  const prefs = me?.preferences ?? DEFAULT_PREFERENCES

  const save = useMutation({
    mutationFn: (change: Partial<Preferences>) =>
      unwrap(api.PATCH('/api/me', { body: { preferences: change } })),
    // Show the change straight away rather than after the round trip.
    onMutate: (change) => {
      const next = { ...prefs, ...change }
      applyPreferences(next)
      qc.setQueryData<Schemas['UserOut']>(keys.me, (old) => old && { ...old, preferences: next })
    },
    onSuccess: (user) => qc.setQueryData(keys.me, user),
    onError: () => qc.invalidateQueries({ queryKey: keys.me }),
  })

  return (
    <section className="card">
      <Label>Settings</Label>
      <div className="settings">
        <Setting
          name="theme"
          label="Appearance"
          hint="System follows your device’s light or dark setting."
          value={prefs.theme}
          choices={[
            ['system', 'System'],
            ['light', 'Light'],
            ['dark', 'Dark'],
          ]}
          onChange={(theme) => save.mutate({ theme })}
        />
        <Setting
          name="text_size"
          label="Text size"
          hint="Larger text is easier to read, especially on a phone."
          value={prefs.text_size}
          choices={[
            ['normal', 'Normal'],
            ['large', 'Larger'],
          ]}
          onChange={(text_size) => save.mutate({ text_size })}
        />
        <Setting
          name="start_page"
          label="Opening a tree"
          hint="Start on the tree’s home page, or go straight to the tree itself."
          value={prefs.start_page}
          choices={[
            ['home', 'Home page'],
            ['tree', 'The tree'],
          ]}
          onChange={(start_page) => save.mutate({ start_page })}
        />
      </div>
      <ErrorText error={save.error} />
    </section>
  )
}

function Setting<K extends keyof Preferences>({
  label,
  hint,
  value,
  choices,
  onChange,
}: {
  name: K
  label: string
  hint: string
  value: Preferences[K]
  choices: Choice<K>[]
  onChange: (value: Preferences[K]) => void
}) {
  const id = useId()
  return (
    <div className="setting">
      <div className="grow">
        <p className="setting-label" id={id}>
          {label}
        </p>
        <p className="muted small">{hint}</p>
      </div>
      <div className="seg" role="radiogroup" aria-labelledby={id}>
        {choices.map(([choice, text]) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={value === choice}
            className={`seg-opt${value === choice ? ' on' : ''}`}
            onClick={() => value !== choice && onChange(choice)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
