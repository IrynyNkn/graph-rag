import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import { EASE_OUT, SMOOTH } from '../../app/motion';
import type { PlacedEdge } from './flow/layout';
import type { GraphFocus } from './graph-focus';
import { HOP_DELAY } from './GraphNodeChip';

interface GraphEdgeLineProps {
  edge: PlacedEdge;
  isLit: boolean;
  isDimmed: boolean;
  isAnswering: boolean;
  onFocus: (focus: GraphFocus) => void;
  onBlur: () => void;
}

export function GraphEdgeLine({
  edge,
  isLit,
  isDimmed,
  isAnswering,
  onFocus,
  onBlur,
}: GraphEdgeLineProps) {
  const classes = [
    'edge',
    edge.isInStrongestChain && 'is-strongest',
    isLit && 'is-lit',
    isDimmed && 'is-dimmed',
  ];
  return (
    <motion.g
      className={classes.filter(Boolean).join(' ')}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.path
        className="edge-line"
        strokeWidth={edge.lineWidth}
        style={{ '--strength': edge.strength } as CSSProperties}
        initial={{ pathLength: 0, d: edge.path }}
        animate={{ pathLength: 1, d: edge.path }}
        transition={{
          pathLength: { delay: (edge.hop + 0.35) * HOP_DELAY, duration: 0.6, ease: EASE_OUT },
          d: SMOOTH,
        }}
      />
      {isAnswering && edge.isInStrongestChain && (
        <path className="edge-pulse" d={edge.path} pathLength={1} />
      )}
      <path
        className="edge-target"
        d={edge.path}
        onMouseEnter={() => onFocus({ kind: 'edge', edge })}
        onMouseLeave={onBlur}
      />
    </motion.g>
  );
}
