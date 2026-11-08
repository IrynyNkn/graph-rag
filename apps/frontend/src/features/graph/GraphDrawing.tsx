import { AnimatePresence, motion } from 'motion/react';
import { SMOOTH } from '../../app/motion';
import type { FlowLayout } from './flow/layout';
import { GraphEdgeLine } from './GraphEdgeLine';
import { GraphNodeChip, HOP_DELAY } from './GraphNodeChip';
import { edgeIsLit, findLitNodes, findRelationLabels, type GraphFocus } from './graph-focus';

interface GraphDrawingProps {
  layout: FlowLayout;
  focus: GraphFocus | null;
  isAnswering: boolean;
  onFocus: (focus: GraphFocus) => void;
  onBlur: () => void;
}

export function GraphDrawing({ layout, focus, isAnswering, onFocus, onBlur }: GraphDrawingProps) {
  const { width, height, scale, nodes, edges } = layout;
  const litNodes = focus && findLitNodes(focus, edges);
  const litEdges = focus ? edges.filter((edge) => edgeIsLit(focus, edge)) : [];
  const labels = focus ? findRelationLabels(focus, layout) : [];
  return (
    <div className="graph-scroll">
      <div className="graph-size" style={{ width: width * scale, height: height * scale }}>
        <div
          className="graph-plane"
          role="group"
          aria-label="The part of the knowledge graph behind this answer"
          style={{ width, height, transform: `scale(${scale})` }}
        >
          <svg className="graph-edges" width={width} height={height} aria-hidden="true">
            <AnimatePresence>
              {edges.toReversed().map((edge) => (
                <GraphEdgeLine
                  key={edge.id}
                  edge={edge}
                  isLit={litEdges.includes(edge)}
                  isDimmed={focus !== null && !litEdges.includes(edge)}
                  isAnswering={isAnswering}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              ))}
            </AnimatePresence>
          </svg>
          <AnimatePresence>
            {layout.columns.map(({ hop, x }) => (
              <motion.span
                key={hop}
                className="graph-column-label"
                initial={{ opacity: 0, x, y: layout.top - 44 }}
                animate={{ opacity: 1, x, y: layout.top - 44 }}
                exit={{ opacity: 0 }}
                transition={{ ...SMOOTH, opacity: { delay: hop * HOP_DELAY, duration: 0.4 } }}
              >
                {hop === 0 ? 'Start' : `${hop} ${hop === 1 ? 'hop' : 'hops'}`}
              </motion.span>
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {nodes.map((node, index) => (
              <GraphNodeChip
                key={node.name}
                node={node}
                index={index}
                isFocused={focus?.kind === 'node' && focus.node === node}
                isDimmed={litNodes !== null && !litNodes.has(node.name)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {labels.map((label) => (
              <motion.span
                key={label.id}
                className={label.isCentred ? 'edge-label is-centred' : 'edge-label'}
                style={{ left: label.x, top: label.y }}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                {label.text}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
