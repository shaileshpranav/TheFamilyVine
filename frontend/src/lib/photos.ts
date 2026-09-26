export type PhotoSize = 'thumb' | 'full'

/** Where a photo's image is served. The API checks who may see it. */
export const photoUrl = (treeId: string, photoId: string | null | undefined, size: PhotoSize = 'thumb') =>
  photoId ? `/api/trees/${treeId}/photos/${photoId}/${size}` : null
