import type { CSSProperties } from 'react';
import type { GraphFocus } from './GraphFocusCard';
import type { PlacedEdge } from './schematic/layout';

interface GraphEdgeLineProps {
  edge: PlacedEdge;
  isDimmed: boolean;
  onFocus: (focus: GraphFocus | null) => void;
}

export function GraphEdgeLine({ edge, isDimmed, onFocus }: GraphEdgeLineProps) {
  const classes = ['edge', isDimmed && 'is-dimmed', edge.isInStrongestChain && 'is-strongest'];
  return (
    <g
      className={classes.filter(Boolean).join(' ')}
      style={{ '--hop': edge.hop } as CSSProperties}
      onMouseEnter={() => onFocus({ kind: 'edge', edge })}
      onMouseLeave={() => onFocus(null)}
    >
      <path
        d={edge.path}
        pathLength={1}
        className="edge-line"
        style={{ strokeWidth: edge.lineWidth }}
      />
      <path d={edge.path} className="edge-hit-area" />
      {edge.label && (
        <text
          x={edge.label.x}
          y={edge.label.y}
          textAnchor={edge.label.anchor}
          className="edge-label"
        >
          {describeRelation(edge)}
        </text>
      )}
    </g>
  );
}

function describeRelation(edge: PlacedEdge): string {
  const relation = edge.relations[0] ?? '';
  return edge.readsForward ? `${relation} →` : `← ${relation}`;
}
