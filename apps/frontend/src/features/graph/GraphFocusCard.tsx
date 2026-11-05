import type { PlacedEdge, PlacedNode } from './schematic/layout';

export type GraphFocus = { kind: 'node'; node: PlacedNode } | { kind: 'edge'; edge: PlacedEdge };

interface GraphFocusCardProps {
  focus: GraphFocus;
  side: 'left' | 'right';
}

export function GraphFocusCard({ focus, side }: GraphFocusCardProps) {
  return (
    <aside className={`graph-card is-${side}`}>
      {focus.kind === 'node' ? (
        <NodeDetails node={focus.node} />
      ) : (
        <EdgeDetails edge={focus.edge} />
      )}
    </aside>
  );
}

function NodeDetails({ node }: { node: PlacedNode }) {
  return (
    <>
      <h3>{node.name}</h3>
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
        {edge.source} → {edge.target}
      </h3>
      <p className="graph-card-meta">weight {edge.weight.toFixed(2)}</p>
      <p>{[...new Set(edge.relations)].join(', ')}</p>
    </>
  );
}
