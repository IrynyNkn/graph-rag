import { motion } from 'motion/react';
import { SNAPPY } from '../../app/motion';
import type { FlowLayout, PlacedEdge, PlacedNode } from './flow/layout';
import type { Panel } from './flow/grid';
import { placeCard, type GraphFocus } from './graph-focus';
import { toDisplayName } from './node-names';
import { useElementSize } from './use-element-size';

interface GraphFocusCardProps {
  focus: GraphFocus;
  layout: FlowLayout;
  panel: Panel;
}

/** One card that travels from element to element, rather than one per hover. */
export function GraphFocusCard({ focus, layout, panel }: GraphFocusCardProps) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const spot = placeCard(focus, layout, panel, size.height);
  const key = focus.kind === 'node' ? focus.node.name : focus.edge.id;
  return (
    <motion.aside
      className="graph-card"
      initial={{ opacity: 0, scale: 0.97, ...spot }}
      animate={{ opacity: 1, scale: 1, ...spot, height: size.height > 0 ? size.height : 'auto' }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      transition={SNAPPY}
    >
      <div ref={ref}>
        <motion.div
          key={key}
          className="graph-card-body"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16 }}
        >
          {focus.kind === 'node' ? (
            <NodeDetails node={focus.node} />
          ) : (
            <EdgeDetails edge={focus.edge} />
          )}
        </motion.div>
      </div>
    </motion.aside>
  );
}

function NodeDetails({ node }: { node: PlacedNode }) {
  return (
    <>
      <h3>{toDisplayName(node.name)}</h3>
      <p className="graph-card-meta">
        {node.type ?? 'entity'} / activation {node.activation.toFixed(2)}
      </p>
      {node.description && <p>{node.description}</p>}
    </>
  );
}

function EdgeDetails({ edge }: { edge: PlacedEdge }) {
  return (
    <>
      <h3>
        {toDisplayName(edge.source)} → {toDisplayName(edge.target)}
      </h3>
      <p className="graph-card-meta">weight {edge.weight.toFixed(2)}</p>
      <p>{[...new Set(edge.relations)].join(', ')}</p>
    </>
  );
}
