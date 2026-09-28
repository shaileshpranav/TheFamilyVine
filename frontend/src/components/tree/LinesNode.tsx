import type { Node, NodeProps } from '@xyflow/react'
import { memo, type PointerEvent } from 'react'
import type { LitSegment, Point, TreeLine } from '../../lib/treeLayout'

export type LinesNodeData = {
  lines: TreeLine[]
  width: number
  height: number
  selected: string | null
  /** When on, lines can be hovered or tapped to explain them. */
  interactive: boolean
  hover: TreeLine | null
  onHover: (line: TreeLine | null) => void
  /** While a line between two people is shown: exactly the pieces of line it runs along. */
  path: LitSegment[] | null
}
export type LinesNodeType = Node<LinesNodeData, 'lines'>

const svgPath = (points: Point[]) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')

/**
 * Every line on the canvas in one SVG layer beneath the people: couples, and the joining
 * lines from parents to children. Drawn as one node so the lines pan and zoom with the tree.
 */
function LinesNode({ data }: NodeProps<LinesNodeType>) {
  const { lines, width, height, selected, interactive, hover, onHover, path } = data
  // Mice hover; touch taps toggle (a touch "leaves" as soon as the finger lifts).
  const enter = (line: TreeLine) => (e: PointerEvent) => e.pointerType === 'mouse' && onHover(line)
  const leave = (e: PointerEvent) => e.pointerType === 'mouse' && onHover(null)

  return (
    <svg className="tree-lines" width={width} height={height} overflow="visible" aria-hidden="true">
      {lines.map((line) => {
        const lit = selected !== null && line.people.includes(selected)
        const hot = hover?.key === line.key
        const state = `${lit ? ' lit' : ''}${hot ? ' hot' : ''}`
        const style =
          line.kind === 'step' ? ' step' : line.kind === 'couple' && line.status !== 'together' ? ' broken' : ''
        // While a chain is shown, every line steps back and the chain is drawn over them.
        const dim = path ? ' dim' : ''
        return (
          <g key={line.key}>
            {line.paths.map((p, i) => (
              <path key={`p${i}`} d={svgPath(p)} className={`tree-line${style}${state}${dim}`} />
            ))}
            {line.childPaths.map((c, i) => (
              <path
                key={`c${i}`}
                d={svgPath(c.path)}
                className={`tree-line rel-${c.relation}${state}${dim}`}
              />
            ))}
            {line.marks.map((m, i) => (
              <path key={`m${i}`} d={svgPath(m)} className={`tree-line${state}${dim}`} />
            ))}
            {interactive &&
              [...line.paths, ...line.childPaths.map((c) => c.path)].map((p, i) => (
                <path
                  key={`h${i}`}
                  d={svgPath(p)}
                  className="tree-hit"
                  onPointerEnter={enter(line)}
                  onPointerLeave={leave}
                  onClick={(e) => {
                    e.stopPropagation()
                    onHover(hot ? null : line)
                  }}
                />
              ))}
          </g>
        )
      })}
      {path?.map((seg, i) => (
        <path key={`lit${i}`} d={svgPath(seg.points)} className={`tree-line${seg.style} path`} />
      ))}
    </svg>
  )
}

export default memo(LinesNode)
