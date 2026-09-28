import { useEffect, useId, useState } from 'react'

const KEY = [
  {
    group: 'Couples',
    items: [
      { label: 'Together', style: '' },
      { label: 'Separated', style: 'broken' },
      { label: 'Divorced', style: 'broken', slashes: true },
    ],
  },
  {
    group: 'Children',
    items: [
      { label: 'By birth', style: '' },
      { label: 'Adopted', style: 'rel-adopted' },
      { label: 'Fostered', style: 'rel-foster' },
      { label: 'Step-parent', style: 'step' },
    ],
  },
]

/** What each line style means, opened from a button beside the Relationships switch. */
export default function LineKey() {
  const [open, setOpen] = useState(false)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        className="key-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        Key
      </button>
      {open && (
        <div id={id} className="line-key" role="group" aria-label="What the lines mean">
          {KEY.map(({ group, items }) => (
            <div key={group}>
              <p className="line-key-group">{group}</p>
              <ul className="plain">
                {items.map((item) => (
                  <li key={item.label}>
                    <svg width="40" height="16" aria-hidden="true">
                      <path d="M2 8H38" className={`tree-line ${item.style}`} />
                      {item.slashes && <path d="M12 14L18 2M19 14L25 2" className="tree-line" />}
                    </svg>
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
