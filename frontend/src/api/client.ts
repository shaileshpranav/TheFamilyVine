import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

export type Schemas = components['schemas']
export type Tree = Schemas['TreeDetailOut']
export type TreeListItem = Schemas['TreeListItem']
export type Person = Schemas['PersonOut']
export type PersonDetail = Schemas['PersonDetailOut']
export type Member = Schemas['MemberOut']
export type Invite = Schemas['InviteOut']
export type Subtree = Schemas['SubtreeOut']
export type Role = Schemas['Role']
export type User = Schemas['UserOut']
export type TimelineItem = Schemas['TimelineItem']
export type RelativeOut = Schemas['RelativeOut']
export type Place = Schemas['PlaceOut']

// Resolve window.fetch per call: SuperTokens patches it to attach and refresh the session.
export const api = createClient<paths>({ baseUrl: '', fetch: (req) => window.fetch(req) })

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function messageFrom(error: unknown): string {
  const detail = (error as { detail?: unknown } | undefined)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d: { msg?: string }) => d.msg ?? 'Invalid input').join('; ')
  }
  return 'Something went wrong'
}

/** Await an openapi-fetch call and return its data, throwing ApiError on failure. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: Awaited<typeof call>
  try {
    result = await call
  } catch (e) {
    // fetch itself failed: no connection, and nothing saved on the device for this request.
    if (!(e instanceof TypeError)) throw e
    throw new ApiError(
      navigator.onLine
        ? 'Couldn’t reach TheFamilyVine. Check your connection and try again.'
        : 'You’re offline. Try again once you’re connected.',
      0,
    )
  }
  const { data, error, response } = result
  if (!response.ok) throw new ApiError(messageFrom(error), response.status)
  return data as T
}

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  owner: {
    label: 'Owner',
    description: 'Everything, including deleting the tree and transferring ownership',
  },
  admin: {
    label: 'Admin',
    description: 'Edit anyone, mark living/deceased, manage members and branches',
  },
  contributor: {
    label: 'Contributor',
    description: 'Add people; edit their own profile and anyone deceased',
  },
  personal: {
    label: 'Personal',
    description: 'View the tree; add and edit only their own profile',
  },
}

export const ASSIGNABLE_ROLES = ['admin', 'contributor', 'personal'] as const
