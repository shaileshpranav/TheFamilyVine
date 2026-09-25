/**
 * Answers `/api/*` requests in the browser for preview mode. Reads come from the sample
 * dataset; every change is refused so it's obvious nothing is saved.
 */
import type { Role } from '../api/client'
import { buildDataset, type Dataset } from './fixtures'

type Handler = (data: Dataset, match: RegExpMatchArray, url: URL) => unknown

const ROUTES: [RegExp, Handler][] = [
  [/^\/api\/me$/, (d) => d.me],
  [/^\/api\/trees$/, (d) => d.trees],
  [/^\/api\/trees\/([^/]+)$/, (d, [, t]) => d.tree[t]],
  [
    /^\/api\/trees\/([^/]+)\/people$/,
    (d, [, t], url) => {
      const q = url.searchParams.get('q')?.trim().toLowerCase()
      const list = d.people[t]
      if (!list || !q) return list
      return list.filter((p) =>
        [p.given_names, p.surname, p.birth_surname, p.nickname, p.native_name].some((v) =>
          v.toLowerCase().includes(q),
        ),
      )
    },
  ],
  [/^\/api\/trees\/([^/]+)\/people\/([^/]+)$/, (d, [, t, p]) => d.person[t]?.[p]],
  [/^\/api\/trees\/([^/]+)\/members$/, (d, [, t]) => d.members[t]],
  [/^\/api\/trees\/([^/]+)\/invites$/, (d, [, t]) => d.invites[t]],
  [/^\/api\/trees\/([^/]+)\/subtrees$/, (d, [, t]) => d.subtrees[t]],
  [/^\/api\/trees\/([^/]+)\/subtrees\/([^/]+)\/people$/, (d, [, t, s]) => d.subtreePeople[t]?.[s]],
  [/^\/api\/trees\/([^/]+)\/places$/, (d, [, t]) => d.places[t]],
  [/^\/api\/invites\/([^/]+)$/, (d, [, token]) => d.invitePreview[token]],
]

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function installMockApi(role: Role) {
  const data = buildDataset(role)
  const realFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url, window.location.origin)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return realFetch(input, init)
    }
    // A short delay so loading states are visible, as they would be against the real API.
    await new Promise((resolve) => setTimeout(resolve, 150))
    if (request.method !== 'GET') {
      return json(403, { detail: 'Preview mode: changes aren’t saved.' })
    }
    for (const [pattern, handler] of ROUTES) {
      const match = url.pathname.match(pattern)
      if (match) {
        const body = handler(data, match, url)
        return body === undefined ? json(404, { detail: 'Not found' }) : json(200, body)
      }
    }
    return json(404, { detail: 'Not found' })
  }
}
