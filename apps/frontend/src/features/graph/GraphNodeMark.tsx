import type { CSSProperties } from 'react';
import type { GraphFocus } from './GraphFocusCard';
import { wrapNodeLabel } from './graph-focus';
import type { PlacedNode } from './schematic/layout';

// Printed slightly out of register with the outline, as a second ink would be.
const SPOT_OFFSET = 1.5;
const LABEL_GAP_BELOW = 16;
const LABEL_GAP_ABOVE = 8;
const LABEL_LINE_HEIGHT = 15;

interface GraphNodeMarkProps {
  node: PlacedNode;
  isDimmed: boolean;
  onFocus: (focus: GraphFocus | null) => void;
}

export function GraphNodeMark({ node, isDimmed, onFocus }: GraphNodeMarkProps) {
  const { x, y, radius, stretch } = node;
  const classes = ['node', node.isSeed && 'is-seed', isDimmed && 'is-dimmed'];
  const shape = {
    x: x - radius,
    y: y - radius - stretch / 2,
    width: 2 * radius,
    height: 2 * radius + stretch,
    rx: radius,
  };
  const lines = wrapNodeLabel(node.name);
  const labelY = node.labelAbove
    ? shape.y - LABEL_GAP_ABOVE - (lines.length - 1) * LABEL_LINE_HEIGHT
    : shape.y + shape.height + LABEL_GAP_BELOW;
  return (
    <g
      className={classes.filter(Boolean).join(' ')}
      style={{ '--hop': node.hop } as CSSProperties}
      onMouseEnter={() => onFocus({ kind: 'node', node })}
      onMouseLeave={() => onFocus(null)}
    >
      <rect {...shape} className="node-ground" />
      {node.isSeed && (
        <rect
          {...shape}
          x={shape.x + SPOT_OFFSET}
          y={shape.y - SPOT_OFFSET}
          className="node-spot"
        />
      )}
      <rect {...shape} className="node-outline" />
      <text x={x} y={labelY} className="node-label">
        {lines.map((line, index) => (
          <tspan key={index} x={x} dy={index === 0 ? 0 : LABEL_LINE_HEIGHT}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
