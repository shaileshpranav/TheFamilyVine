import { CaretLeft, CaretRight, ImageSquare, Trash, UserCircle, X } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api, type PersonDetail, type Schemas, unwrap } from '../api/client'
import { useInvalidateTree, usePersonPhotos } from '../api/hooks'
import { photoUrl } from '../lib/photos'
import { ErrorText, Label } from './ui'

type Photo = Schemas['PhotoOut']

/** A multipart upload body: the file and any other fields. */
function formBody(fields: Record<string, string | Blob>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return form
}

/** Someone's photos: add some, look through them, choose their profile picture. */
export default function PhotoGallery({ treeId, person }: { treeId: string; person: PersonDetail }) {
  const { data: photos } = usePersonPhotos(treeId, person.id)
  const canEdit = person.permissions.can_edit
  const [open, setOpen] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const invalidate = useInvalidateTree()

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        await unwrap(
          api.POST('/api/trees/{tree_id}/people/{person_id}/photos', {
            params: { path: { tree_id: treeId, person_id: person.id } },
            body: { file: file.name },
            bodySerializer: () => formBody({ file }),
          }),
        )
      }
    },
    onSettled: () => invalidate(treeId),
  })

  const name = person.given_names || person.display_name
  return (
    <section className="card">
      <div className="section-head">
        <Label>Photos</Label>
        {canEdit && (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={upload.isPending}
              onClick={() => input.current?.click()}
            >
              <ImageSquare size={15} /> {upload.isPending ? 'Adding…' : 'Add photos'}
            </button>
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                if (files.length) upload.mutate(files)
              }}
            />
          </>
        )}
      </div>
      <ErrorText error={upload.error} />
      {!photos?.length ? (
        <p className="muted small">
          {canEdit ? `No photos of ${name} yet. The first one you add becomes their profile picture.` : 'No photos yet.'}
        </p>
      ) : (
        <ul className="plain photo-grid">
          {photos.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                className="photo-thumb"
                aria-label={p.caption || `Photo ${i + 1} of ${photos.length}`}
                onClick={() => setOpen(i)}
              >
                <img src={photoUrl(treeId, p.id)!} alt="" loading="lazy" />
                {p.id === person.photo_id && <span className="photo-badge">Profile</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open !== null && photos?.[open] && (
        <Lightbox
          treeId={treeId}
          person={person}
          photos={photos}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}

function Lightbox({
  treeId,
  person,
  photos,
  index,
  onIndex,
  onClose,
}: {
  treeId: string
  person: PersonDetail
  photos: Photo[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const photo = photos[index]
  const canEdit = person.permissions.can_edit
  const invalidate = useInvalidateTree()
  const [caption, setCaption] = useState<string | null>(null)
  const close = useRef<HTMLButtonElement>(null)
  const go = (step: number) => {
    setCaption(null)
    onIndex((index + step + photos.length) % photos.length)
  }

  useEffect(() => {
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const path = { tree_id: treeId, photo_id: photo.id }
  const makeProfile = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT('/api/trees/{tree_id}/people/{person_id}/photo', {
          params: { path: { tree_id: treeId, person_id: person.id } },
          body: { photo_id: photo.id },
        }),
      ),
    onSuccess: () => invalidate(treeId),
  })
  const saveCaption = useMutation({
    mutationFn: (text: string) =>
      unwrap(api.PATCH('/api/trees/{tree_id}/photos/{photo_id}', { params: { path }, body: { caption: text } })),
    onSuccess: () => {
      setCaption(null)
      invalidate(treeId)
    },
  })
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/trees/{tree_id}/photos/{photo_id}', { params: { path } })),
    onSuccess: () => {
      if (photos.length === 1) onClose()
      else if (index === photos.length - 1) onIndex(index - 1)
      invalidate(treeId)
    },
  })
  const error = makeProfile.error ?? saveCaption.error ?? remove.error

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo" onClick={onClose}>
      <figure onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-image">
          <img src={photoUrl(treeId, photo.id, 'full')!} alt={photo.caption} />
          {photos.length > 1 && (
            <>
              <button type="button" className="lightbox-nav prev" aria-label="Previous photo" onClick={() => go(-1)}>
                <CaretLeft size={20} />
              </button>
              <button type="button" className="lightbox-nav next" aria-label="Next photo" onClick={() => go(1)}>
                <CaretRight size={20} />
              </button>
            </>
          )}
        </div>
        <figcaption>
          {canEdit && caption !== null ? (
            <form
              className="lightbox-caption"
              onSubmit={(e) => {
                e.preventDefault()
                saveCaption.mutate(caption)
              }}
            >
              <input
                autoFocus
                maxLength={500}
                placeholder="Who, where, when…"
                aria-label="Caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
              <button className="btn btn-sm" disabled={saveCaption.isPending}>
                Save
              </button>
            </form>
          ) : (
            <p className={photo.caption ? '' : 'muted'}>
              {photo.caption || (canEdit ? 'No caption yet.' : '')}
              {canEdit && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCaption(photo.caption)}>
                  {photo.caption ? 'Edit caption' : 'Add a caption'}
                </button>
              )}
            </p>
          )}
          <div className="actions">
            <span className="mono muted small">
              {index + 1} of {photos.length}
            </span>
            {canEdit && photo.id !== person.photo_id && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={makeProfile.isPending} onClick={() => makeProfile.mutate()}>
                <UserCircle size={15} /> Use as profile picture
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={remove.isPending}
                onClick={() => confirm('Delete this photo? It can’t be undone.') && remove.mutate()}
              >
                <Trash size={15} /> Delete
              </button>
            )}
            <button ref={close} type="button" className="btn btn-secondary btn-sm push-right" onClick={onClose}>
              <X size={15} /> Close
            </button>
          </div>
          <ErrorText error={error} />
        </figcaption>
      </figure>
    </div>
  )
}
