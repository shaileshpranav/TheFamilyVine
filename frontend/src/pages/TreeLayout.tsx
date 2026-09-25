import { Outlet } from 'react-router'
import { useTree, useTreeId } from '../api/hooks'
import { ErrorText, Loading } from '../components/ui'

/** Loads the tree once and hands it to every page inside it (see `useCurrentTree`). */
export default function TreeLayout() {
  const treeId = useTreeId()
  const { data: tree, error, isLoading } = useTree(treeId)

  if (isLoading) return <Loading />
  if (error || !tree) return <ErrorText error={error ?? 'Tree not found'} />
  return <Outlet context={tree} />
}
