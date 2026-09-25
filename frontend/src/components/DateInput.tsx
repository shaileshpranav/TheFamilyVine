import { useId, useState } from 'react'
import { type FuzzyDate, MONTHS, dateLabel } from '../lib/dates'

type Qualifier = NonNullable<FuzzyDate['qualifier']>

const QUALIFIERS: { value: Qualifier; label: string }[] = [
  { value: 'exact', label: 'On' },
  { value: 'about', label: 'About' },
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
  { value: 'between', label: 'Between' },
]

interface Parts {
  qualifier: Qualifier
  day: string
  month: string
  year: string
  day2: string
  month2: string
  year2: string
}

const num = (s: string) => (s.trim() ? Number(s) : null)

function toParts(d: FuzzyDate | null): Parts {
  const s = (n?: number | null) => (n ? String(n) : '')
  return {
    qualifier: d?.qualifier ?? 'exact',
    day: s(d?.day),
    month: s(d?.month),
    year: s(d?.year),
    day2: s(d?.day2),
    month2: s(d?.month2),
    year2: s(d?.year2),
  }
}

function toDate(p: Parts): FuzzyDate | null {
  const year = num(p.year)
  if (!year) return null
  const between = p.qualifier === 'between'
  return {
    qualifier: p.qualifier,
    year,
    month: num(p.month),
    day: num(p.day),
    year2: between ? num(p.year2) : null,
    month2: between ? num(p.month2) : null,
    day2: between ? num(p.day2) : null,
    phrase: '',
  }
}

/** An approximate date: "On 12 March 1931", "About 1920", "Between 1900 and 1905". */
export default function DateInput({
  value,
  onChange,
  label = 'Date',
}: {
  value: FuzzyDate | null
  onChange: (value: FuzzyDate | null) => void
  label?: string
}) {
  const [parts, setParts] = useState<Parts>(() => toParts(value))
  const id = useId()

  function update(patch: Partial<Parts>) {
    const next = { ...parts, ...patch }
    setParts(next)
    onChange(toDate(next))
  }

  const current = toDate(parts)
  return (
    <fieldset className="field date-field">
      <legend className="field-label">{label}</legend>
      <div className="date-input">
        <select
          aria-label="How exact"
          value={parts.qualifier}
          onChange={(e) => update({ qualifier: e.target.value as Qualifier })}
        >
          {QUALIFIERS.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}
            </option>
          ))}
        </select>
        <DateParts id={id} parts={parts} suffix="" update={update} />
      </div>
      {parts.qualifier === 'between' && (
        <div className="date-input">
          <span className="date-and">and</span>
          <DateParts id={`${id}-2`} parts={parts} suffix="2" update={update} />
        </div>
      )}
      <span className="field-hint">
        {!current
          ? 'Leave the year empty if the date isn’t known.'
          : parts.qualifier === 'between' && !current.year2
            ? 'Add the year the range ends.'
            : dateLabel(current)}
      </span>
    </fieldset>
  )
}

function DateParts({
  id,
  parts,
  suffix,
  update,
}: {
  id: string
  parts: Parts
  suffix: '' | '2'
  update: (patch: Partial<Parts>) => void
}) {
  const key = (k: 'day' | 'month' | 'year') => `${k}${suffix}` as keyof Parts
  return (
    <>
      <input
        id={`${id}-day`}
        aria-label="Day"
        inputMode="numeric"
        placeholder="Day"
        maxLength={2}
        value={parts[key('day')]}
        onChange={(e) => update({ [key('day')]: e.target.value.replace(/\D/g, '') })}
      />
      <select
        aria-label="Month"
        value={parts[key('month')]}
        onChange={(e) => update({ [key('month')]: e.target.value })}
      >
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <input
        aria-label="Year"
        inputMode="numeric"
        placeholder="Year"
        maxLength={4}
        value={parts[key('year')]}
        onChange={(e) => update({ [key('year')]: e.target.value.replace(/\D/g, '') })}
      />
    </>
  )
}
