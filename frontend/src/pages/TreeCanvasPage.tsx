import '@xyflow/react/dist/base.css'
import { CornersOut, Crosshair, Minus, Path, Plus } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useReactFlow,
  useStore,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Tree } from '../api/client'
import { useCurrentTree, useKin, useSubtrees, useTreeGraph } from '../api/hooks'
import LineKey from '../components/tree/LineKey'
import LinesNode, { type LinesNodeType } from '../components/tree/LinesNode'
import PersonNode, { type PersonNodeType } from '../components/tree/PersonNode'
import RelatePanel, { type RelatePick } from '../components/tree/RelatePanel'
import TreePanel, { type PanelMode } from '../components/tree/TreePanel'
import TreeSearch from '../components/tree/TreeSearch'
import { Empty, ErrorText } from '../components/ui'
import { getElk } from '../lib/elk'
import {
  NODE_H,
  NODE_W,
  type TreeGraph,
  type TreeLayout,
  type TreeLine,
  layoutTree,
  pathSegments,
  treeLines,
} from '../lib/treeLayout'
import { relationToYou } from '../lib/relationship'

const nodeTypes = { person: PersonNode, lines: LinesNode }

interface View {
  branch: string
  graph: TreeGraph
  layout: TreeLayout
  lines: TreeLine[]
}

export default function TreeCanvasPage() {
  const tree = useCurrentTree()
  const [params] = useSearchParams()
  const [branch, setBranch] = useState('')
  const graph = useTreeGraph(tree.id, branch || undefined)
  // The layout keeps the graph it was made from, so people and positions always match.
  const view = useQuery({
    queryKey: ['tree', tree.id, 'layout', branch, graph.dataUpdatedAt],
    queryFn: async (): Promise<View> => {
      const g = graph.data!
      const layout = await layoutTree(g, getElk())
      return { branch, graph: g, layout, lines: treeLines(g, layout) }
    },
    // While a switched-to branch loads, the previous graph stands in as placeholder data; lay
    // out only real data, so a branch's view never holds another branch's people.
    enabled: !!graph.data && !graph.isPlaceholderData,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  })

  if (graph.error) {
    return (
      <div className="canvas-message">
        <ErrorText error={graph.error} />
      </div>
    )
  }
  if (!view.data) return <div className="canvas-message muted">Arranging the tree…</div>
  if (!view.data.graph.people.length && !branch) {
    return (
      <div className="canvas-message">
        <Empty
          title="No one on the tree yet"
          action={
            <Link to="../people?add=person" relative="path" className="btn">
              Add the first person
            </Link>
          }
        >
          Start with yourself or the oldest ancestor you know about. Everyone you add appears here.
        </Empty>
      </div>
    )
  }
  return (
    <ReactFlowProvider>
      <Canvas
        tree={tree}
        view={view.data}
        branch={branch}
        onBranchChange={setBranch}
        focusId={params.get('focus')}
        relateId={params.get('relate')}
      />
    </ReactFlowProvider>
  )
}

function Canvas({
  tree,
  view,
  branch,
  onBranchChange,
  focusId,
  relateId,
}: {
  tree: Tree
  view: View
  branch: string
  onBranchChange: (branch: string) => void
  focusId: string | null
  /** Opened with ?relate=<id> (from a profile): "How are we related?" with that person. */
  relateId: string | null
}) {
  const { graph, layout, lines } = view
  const rf = useReactFlow()
  const { data: branches } = useSubtrees(tree.id)
  const meId = tree.access.my_person_id
  // Opened with ?focus=<id> (e.g. "Show on tree"): start with that person selected.
  const focused = focusId && layout.positions.has(focusId) ? focusId : null
  const [selected, setSelected] = useState<string | null>(focused)
  const [panel, setPanel] = useState<PanelMode | null>(focused ? 'view' : null)
  const [interactive, setInteractive] = useState(true)
  const [hover, setHover] = useState<TreeLine | null>(null)
  const [ready, setReady] = useState(false)
  // Someone just added, to bring into view once they've been laid out.
  const pendingCentre = useRef<string | null>(null)
  // "How are we related?" looks across everyone the viewer can see, whatever branch is shown.
  const kin = useKin(tree.id)
  const everyone = useTreeGraph(tree.id).data?.people ?? graph.people
  const [relate, setRelate] = useState<RelatePick | null>(
    relateId ? { from: meId && meId !== relateId ? meId : null, to: relateId } : null,
  )
  // A line between two people, lit on the canvas until cleared.
  const [path, setPath] = useState<{ ids: string[]; summary: string } | null>(null)
  const onPath = useMemo(() => (path ? pathSegments(lines, path.ids) : null), [lines, path])
  const pendingPath = useRef<string[] | null>(null)
  // After switching branch, forget whoever and whatever isn't on screen any more.
  const shownSelected = selected && layout.positions.has(selected) ? selected : null
  const shownHover = hover && lines.some((l) => l.key === hover.key) ? hover : null

  const paneWidth = useStore((s) => s.width)
  const paneHeight = useStore((s) => s.height)
  /**
   * Bring someone to the middle of the part of the canvas that's still visible: beside the
   * side panel on desktop, above the bottom sheet on phones.
   */
  const centre = useCallback(
    (id: string, zoomTo?: number, duration = 450, withPanel = true) => {
      const p = layout.positions.get(id)
      if (!p) return false
      const zoom = zoomTo ?? Math.max(rf.getZoom(), 0.85)
      const desktop = window.matchMedia('(min-width: 900px)').matches
      const dx = withPanel && desktop ? (380 + 16) / 2 / zoom : 0
      const dy = withPanel && !desktop ? (paneHeight * 0.31) / zoom : 0
      void rf.setCenter(p.x + NODE_W / 2 + dx, p.y + NODE_H / 2 + dy, { zoom, duration })
      return true
    },
    [layout, rf, paneHeight],
  )
  const select = useCallback((id: string) => {
    setSelected(id)
    setPanel('view')
    setHover(null)
  }, [])
  // A tapped person who'd end up under the side panel or bottom sheet is brought into view;
  // anyone already visible stays put, so the tree doesn't jump on every tap.
  const selectOnCanvas = useCallback(
    (id: string) => {
      select(id)
      const p = layout.positions.get(id)
      if (!p) return
      const { x, y, zoom } = rf.getViewport()
      const desktop = window.matchMedia('(min-width: 900px)').matches
      const hidden = desktop
        ? (p.x + NODE_W) * zoom + x > paneWidth - 412
        : (p.y + NODE_H) * zoom + y > paneHeight * 0.28
      if (hidden) centre(id)
    },
    [select, layout, rf, paneWidth, paneHeight, centre],
  )
  const addRelative = useCallback((id: string) => {
    setSelected(id)
    setPanel('pick')
  }, [])
  const closePanel = useCallback(() => {
    setSelected(null)
    setPanel(null)
    setHover(null)
    setRelate(null)
  }, [])
  const openRelate = useCallback(
    (to: string | null) => {
      setRelate({ from: meId && meId !== to ? meId : null, to })
      setHover(null)
    },
    [meId],
  )

  // Fit to the layout's own bounds (known before React Flow has measured the nodes), but never
  // beyond normal size, so a small tree or branch isn't blown up.
  const fitAll = useCallback(
    (duration = 400) => {
      const fit = Math.min(paneWidth / (layout.width * 1.24), paneHeight / (layout.height * 1.24), 1)
      void rf.setCenter(layout.width / 2, layout.height / 2, { zoom: Math.max(fit, 0.15), duration })
    },
    [rf, layout, paneWidth, paneHeight],
  )

  /** Frame a few people, such as a line between two of them, without zooming in too far. */
  const frame = useCallback(
    (ids: string[]) => {
      const boxes = ids.map((id) => layout.positions.get(id)).filter((b) => b !== undefined)
      if (!boxes.length) return
      const x0 = Math.min(...boxes.map((b) => b.x))
      const y0 = Math.min(...boxes.map((b) => b.y))
      const w = Math.max(...boxes.map((b) => b.x + NODE_W)) - x0
      const h = Math.max(...boxes.map((b) => b.y + NODE_H)) - y0
      const zoom = Math.max(Math.min(paneWidth / (w * 1.3), paneHeight / (h * 1.5), 1), 0.15)
      void rf.setCenter(x0 + w / 2, y0 + h / 2, { zoom, duration: 450 })
    },
    [layout, rf, paneWidth, paneHeight],
  )
  const showPath = useCallback(
    (ids: string[], summary: string) => {
      setRelate(null)
      setPanel(null)
      setSelected(null)
      setPath({ ids, summary })
      if (ids.every((id) => layout.positions.has(id))) frame(ids)
      else {
        // Someone on the line is outside the branch shown, so show the whole tree.
        pendingPath.current = ids
        onBranchChange('')
      }
    },
    [layout, frame, onBranchChange],
  )
  useEffect(() => {
    const ids = pendingPath.current
    if (ids && ids.every((id) => layout.positions.has(id))) {
      pendingPath.current = null
      frame(ids)
    }
  }, [layout, frame])

  // First look at a tree or branch (once its layout has arrived): centre on the person asked
  // for, or on you, or fit everyone.
  const shownFor = useRef<string | null>(null)
  useEffect(() => {
    if (!ready || view.branch !== branch || shownFor.current === branch) return
    shownFor.current = branch
    const target = [focusId, meId].find((id) => id && layout.positions.has(id))
    // Only a person opened from elsewhere starts with their panel open.
    if (target) centre(target, 0.85, 0, target === focusId)
    else fitAll(0)
  }, [ready, view.branch, branch, focusId, meId, layout, centre, fitAll])

  useEffect(() => {
    const id = pendingCentre.current
    if (id && layout.positions.has(id)) {
      pendingCentre.current = null
      centre(id)
    }
  }, [layout, centre])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (relate || panel) closePanel()
      else setPath(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closePanel, relate, panel])

  const nodes = useMemo<(PersonNodeType | LinesNodeType)[]>(
    () => [
      {
        id: '__lines',
        type: 'lines',
        position: { x: 0, y: 0 },
        data: {
          lines,
          width: layout.width,
          height: layout.height,
          selected: shownSelected,
          interactive,
          hover: shownHover,
          onHover: setHover,
          path: onPath,
        },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      },
      ...graph.people
        .filter((p) => layout.positions.has(p.id))
        .map(
          (p): PersonNodeType => ({
            id: p.id,
            type: 'person',
            position: layout.positions.get(p.id)!,
            data: {
              person: p,
              isMe: p.id === meId,
              selected: p.id === shownSelected,
              path: path ? (path.ids.includes(p.id) ? 'on' : 'off') : null,
              canAdd: tree.access.can_create_people,
              onSelect: selectOnCanvas,
              onAdd: addRelative,
            },
            draggable: false,
            selectable: false,
            focusable: false,
          }),
        ),
    ],
    [graph, layout, lines, shownSelected, interactive, shownHover, onPath, path, meId, tree.access.can_create_people, selectOnCanvas, addRelative],
  )

  const allLabel = tree.access.tree_role ? 'Whole tree' : 'All your branches'
  return (
    <div className={`canvas${relate || (shownSelected && panel) ? ' has-panel' : ''}`}>
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        onInit={() => setReady(true)}
        onPaneClick={closePanel}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        zoomOnDoubleClick={false}
        minZoom={0.15}
        maxZoom={1.75}
        onlyRenderVisibleElements={graph.people.length > 150}
        attributionPosition="bottom-right"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--canvas-dots)" />
        {interactive && shownHover && <LineTooltip line={shownHover} />}
      </ReactFlow>

      <div className="canvas-head">
        <div className="canvas-title">
          <p className="kicker">Family tree</p>
          <h1>{tree.name}</h1>
          <p className="canvas-hint">
            Drag to explore · tap a person{interactive ? ' or a line' : ''}
          </p>
        </div>
        <div className="canvas-tools">
          <button
            type="button"
            className="btn btn-secondary btn-sm relate-open"
            aria-label="How are we related?"
            title="How are we related?"
            onClick={() => openRelate(shownSelected)}
          >
            <Path size={15} />
            <span>How are we related?</span>
          </button>
          <TreeSearch
            people={graph.people}
            onPick={(id) => {
              select(id)
              centre(id)
            }}
          />
          {branches && branches.length > 0 && (
            <select aria-label="Show" value={branch} onChange={(e) => onBranchChange(e.target.value)}>
              <option value="">{allLabel}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {path && (
          <div className="path-bar-row">
            <p className="path-bar" role="status">
              <Path size={15} />
              <span>{path.summary}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPath(null)}>
                Clear
              </button>
            </p>
          </div>
        )}
      </div>

      {branch && graph.people.length === 0 && (
        <p className="canvas-note muted">No one in this branch yet.</p>
      )}

      <div className="canvas-foot">
        <button
          type="button"
          role="switch"
          aria-checked={interactive}
          className="rel-switch"
          onClick={() => {
            setInteractive((on) => !on)
            setHover(null)
          }}
        >
          <span className={`switch${interactive ? ' on' : ''}`} aria-hidden="true" />
          Relationships
        </button>
        <LineKey />
      </div>

      <div className="canvas-controls" role="toolbar" aria-label="View">
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => void rf.zoomIn({ duration: 200 })}>
          <Plus size={17} />
        </button>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => void rf.zoomOut({ duration: 200 })}>
          <Minus size={17} />
        </button>
        <button
          type="button"
          aria-label="Fit everyone on screen"
          title="Fit everyone on screen"
          onClick={() => fitAll()}
        >
          <CornersOut size={17} />
        </button>
        {meId && layout.positions.has(meId) && (
          <button
            type="button"
            aria-label="Centre on you"
            title="Centre on you"
            onClick={() => {
              select(meId)
              centre(meId, 0.9)
            }}
          >
            <Crosshair size={17} />
          </button>
        )}
      </div>

      {relate ? (
        <RelatePanel
          kin={kin}
          people={everyone}
          meId={meId}
          pick={relate}
          onPick={setRelate}
          onShow={showPath}
          onClose={() => setRelate(null)}
        />
      ) : shownSelected && panel && (
        <TreePanel
          key={shownSelected}
          tree={tree}
          personId={shownSelected}
          mode={panel}
          onModeChange={setPanel}
          onClose={closePanel}
          onRelate={openRelate}
          relationLabel={meId && kin ? relationToYou(kin.relate(meId, shownSelected)) : null}
          onSelect={(id) => {
            select(id)
            centre(id)
          }}
          onCentre={(id) => centre(id)}
          onAdded={(id) => {
            select(id)
            pendingCentre.current = id
          }}
        />
      )}
    </div>
  )
}

/** Explains the hovered line. Counter-scaled so it stays readable at any zoom. */
function LineTooltip({ line }: { line: TreeLine }) {
  const [, panY, zoom] = useStore((s) => s.transform)
  // Near the top of the screen the header would cover it, so show it below the line instead.
  const below = line.anchor.y * zoom + panY < 150
  return (
    <ViewportPortal>
      <div
        className="tree-tip"
        role="status"
        style={
          below
            ? {
                transformOrigin: '50% 0',
                transform: `translate(${line.anchor.x}px, ${line.anchor.y + 34 / zoom}px) translate(-50%, 0) scale(${1 / zoom})`,
              }
            : {
                transform: `translate(${line.anchor.x}px, ${line.anchor.y}px) translate(-50%, -100%) scale(${1 / zoom})`,
              }
        }
      >
        <strong>{line.title}</strong>
        <span>{line.subtitle}</span>
      </div>
    </ViewportPortal>
  )
}
