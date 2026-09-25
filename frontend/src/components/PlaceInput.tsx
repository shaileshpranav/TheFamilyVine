import { useId } from 'react'
import { usePlaces } from '../api/hooks'

/** Free text, suggesting places already used in this tree so spellings stay consistent. */
export default function PlaceInput({
  treeId,
  value,
  onChange,
  id,
}: {
  treeId: string
  value: string
  onChange: (value: string) => void
  id?: string
}) {
  const { data: places } = usePlaces(treeId)
  const listId = useId()
  return (
    <>
      <input
        id={id}
        list={listId}
        value={value}
        autoComplete="off"
        placeholder="City, region, country"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {places?.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
    </>
  )
}
