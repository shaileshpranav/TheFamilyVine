import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { Kin } from '../lib/relationship'
import { api, type Tree, unwrap } from './client'

export const keys = {
  me: ['me'] as const,
  trees: ['trees'] as const,
  tree: (id: string) => ['tree', id] as const,
  people: (id: string, q = '') => ['tree', id, 'people', q] as const,
  person: (id: string, pid: string) => ['tree', id, 'person', pid] as const,
  members: (id: string) => ['tree', id, 'members'] as const,
  invites: (id: string) => ['tree', id, 'invites'] as const,
  subtrees: (id: string) => ['tree', id, 'subtrees'] as const,
  subtreePeople: (id: string, sid: string) => ['tree', id, 'subtrees', sid] as const,
  places: (id: string) => ['tree', id, 'places'] as const,
}

/** The tree loaded by TreeLayout, for pages rendered inside it. */
export function useCurrentTree() {
  return useOutletContext<Tree>()
}

export function useTreeId(): string {
  return useParams().treeId!
}

/** Invalidate everything cached for one tree (cheap; trees are small). */
export function useInvalidateTree() {
  const qc = useQueryClient()
  return (treeId: string) => qc.invalidateQueries({ queryKey: ['tree', treeId] })
}

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => unwrap(api.GET('/api/me')) })
}

export function useTrees() {
  return useQuery({ queryKey: keys.trees, queryFn: () => unwrap(api.GET('/api/trees')) })
}

/** `treeId` may be undefined (e.g. in the app shell outside a tree); the query then idles. */
export function useTree(treeId: string | undefined) {
  return useQuery({
    queryKey: keys.tree(treeId ?? ''),
    enabled: !!treeId,
    queryFn: () =>
      unwrap(api.GET('/api/trees/{tree_id}', { params: { path: { tree_id: treeId! } } })),
  })
}

export function usePeople(treeId: string, q = '') {
  return useQuery({
    queryKey: keys.people(treeId, q),
    queryFn: () =>
      unwrap(
        api.GET('/api/trees/{tree_id}/people', {
          params: { path: { tree_id: treeId }, query: q ? { q } : {} },
        }),
      ),
  })
}

/** A person's full profile. Pass `null` to wait until someone is chosen. */
export function usePerson(treeId: string, personId: string | null) {
  return useQuery({
    queryKey: keys.person(treeId, personId ?? ''),
    queryFn: () =>
      unwrap(
        api.GET('/api/trees/{tree_id}/people/{person_id}', {
          params: { path: { tree_id: treeId, person_id: personId! } },
        }),
      ),
    enabled: personId !== null,
  })
}

export function useMembers(treeId: string) {
  return useQuery({
    queryKey: keys.members(treeId),
    queryFn: () =>
      unwrap(api.GET('/api/trees/{tree_id}/members', { params: { path: { tree_id: treeId } } })),
  })
}

export function useInvites(treeId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.invites(treeId),
    enabled,
    queryFn: () =>
      unwrap(api.GET('/api/trees/{tree_id}/invites', { params: { path: { tree_id: treeId } } })),
  })
}

export function useSubtrees(treeId: string) {
  return useQuery({
    queryKey: keys.subtrees(treeId),
    queryFn: () =>
      unwrap(api.GET('/api/trees/{tree_id}/subtrees', { params: { path: { tree_id: treeId } } })),
  })
}

export function useSubtreePeople(treeId: string, subtreeId: string | null) {
  return useQuery({
    queryKey: keys.subtreePeople(treeId, subtreeId ?? ''),
    enabled: !!subtreeId,
    queryFn: () =>
      unwrap(
        api.GET('/api/trees/{tree_id}/subtrees/{subtree_id}/people', {
          params: { path: { tree_id: treeId, subtree_id: subtreeId! } },
        }),
      ),
  })
}

export function usePlaces(treeId: string) {
  return useQuery({
    queryKey: keys.places(treeId),
    queryFn: () =>
      unwrap(api.GET('/api/trees/{tree_id}/places', { params: { path: { tree_id: treeId } } })),
    staleTime: 60_000,
  })
}

/** Everyone the viewer can see (optionally one branch) with the couples that join them. */
/** Relationships between everyone the viewer can see (see lib/relationship). */
export function useKin(treeId: string) {
  const { data } = useTreeGraph(treeId)
  return useMemo(() => (data ? new Kin(data) : null), [data])
}

export function useTreeGraph(treeId: string, subtreeId?: string) {
  return useQuery({
    queryKey: ['tree', treeId, 'graph', subtreeId ?? ''],
    queryFn: () =>
      unwrap(
        api.GET('/api/trees/{tree_id}/graph', {
          params: { path: { tree_id: treeId }, query: subtreeId ? { subtree_id: subtreeId } : {} },
        }),
      ),
    placeholderData: keepPreviousData,
  })
}

export function usePersonPhotos(treeId: string, personId: string) {
  return useQuery({
    queryKey: ['tree', treeId, 'photos', personId],
    queryFn: () =>
      unwrap(
        api.GET('/api/trees/{tree_id}/people/{person_id}/photos', {
          params: { path: { tree_id: treeId, person_id: personId } },
        }),
      ),
  })
}

/** Health, for people the viewer may see it for (the person and their blood relatives). */
export function useConditions(treeId: string, personId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['tree', treeId, 'conditions', personId],
    queryFn: () =>
      unwrap(
        api.GET('/api/trees/{tree_id}/people/{person_id}/conditions', {
          params: { path: { tree_id: treeId, person_id: personId } },
        }),
      ),
    enabled,
  })
}

