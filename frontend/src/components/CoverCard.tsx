import { ImageSquare, Trash } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { api, type Tree, unwrap } from '../api/client'
import { keys, useInvalidateTree } from '../api/hooks'
import { photoUrl } from '../lib/photos'
import { ErrorText, Label } from './ui'

/** The tree's cover photo, shown on its home page and on "Your trees". */
export default function CoverCard({ tree }: { tree: Tree }) {
  const input = useRef<HTMLInputElement>(null)
  const invalidate = useInvalidateTree()
  const qc = useQueryClient()
  const done = () => {
    invalidate(tree.id)
    qc.invalidateQueries({ queryKey: keys.trees })
  }
  const upload = useMutation({
    mutationFn: (file: File) =>
      unwrap(
        api.PUT('/api/trees/{tree_id}/cover', {
          params: { path: { tree_id: tree.id } },
          body: { file: file.name },
          bodySerializer: () => {
            const form = new FormData()
            form.append('file', file)
            return form
          },
        }),
      ),
    onSuccess: done,
  })
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/trees/{tree_id}/cover', { params: { path: { tree_id: tree.id } } })),
    onSuccess: done,
  })
  const cover = photoUrl(tree.id, tree.cover_photo_id, 'full')

  return (
    <section className="card">
      <Label>Cover photo</Label>
      {cover ? (
        <img className="cover-preview" src={cover} alt="" />
      ) : (
        <p className="muted small">A photo for the top of the tree’s home page, like a family gathering or an old home.</p>
      )}
      <div className="actions" style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-secondary btn-sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
          <ImageSquare size={15} /> {upload.isPending ? 'Uploading…' : cover ? 'Change photo' : 'Choose a photo'}
        </button>
        {cover && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
            <Trash size={15} /> Remove
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) upload.mutate(file)
          }}
        />
      </div>
      <ErrorText error={upload.error ?? remove.error} />
    </section>
  )
}
