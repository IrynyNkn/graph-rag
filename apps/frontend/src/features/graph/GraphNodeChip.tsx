import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import { EASE_OUT, SMOOTH } from '../../app/motion';
import type { PlacedNode } from './flow/layout';
import type { GraphFocus } from './graph-focus';
import { toDisplayName } from './node-names';

/** The graph unfolds a hop at a time, the way activation spread through it. */
export const HOP_DELAY = 0.16;
const WITHIN_COLUMN_DELAY = 0.012;

interface GraphNodeChipProps {
  node: PlacedNode;
  index: number;
  isFocused: boolean;
  isDimmed: boolean;
  onFocus: (focus: GraphFocus) => void;
  onBlur: () => void;
  onAskAbout: (name: string) => void;
}

export function GraphNodeChip({
  node,
  index,
  isFocused,
  isDimmed,
  onFocus,
  onBlur,
  onAskAbout,
}: GraphNodeChipProps) {
  const classes = [
    'node',
    node.isSeed && 'is-seed',
    node.isOnStrongestPath && 'is-on-path',
    isFocused && 'is-focused',
    isDimmed && 'is-dimmed',
  ];
  const place = { x: node.x, y: node.y - node.height / 2 };
  const delay = node.hop * HOP_DELAY + index * WITHIN_COLUMN_DELAY;
  const focus: GraphFocus = { kind: 'node', node };
  return (
    <motion.button
      type="button"
      className={classes.filter(Boolean).join(' ')}
      style={{ '--strength': node.strength, height: node.height } as CSSProperties}
      initial={{ opacity: 0, scale: 0.92, ...place }}
      animate={{ opacity: 1, scale: 1, ...place }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
      transition={{
        ...SMOOTH,
        opacity: { delay, duration: 0.35, ease: EASE_OUT },
        scale: { delay, duration: 0.45, ease: EASE_OUT },
      }}
      onMouseEnter={() => onFocus(focus)}
      onMouseLeave={onBlur}
      onFocus={() => onFocus(focus)}
      onBlur={onBlur}
      onClick={() => onAskAbout(toDisplayName(node.name))}
    >
      <i className="node-dot" aria-hidden="true" />
      <span className="node-name">
        {node.lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
    </motion.button>
  );
}
