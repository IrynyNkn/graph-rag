import { GraphEdgeLine } from './GraphEdgeLine';
import type { GraphFocus } from './GraphFocusCard';
import { GraphNodeMark } from './GraphNodeMark';
import { edgeIsLit, findLitNodes } from './graph-focus';
import type { SchematicLayout } from './schematic/layout';

interface GraphDrawingProps {
  layout: SchematicLayout;
  focus: GraphFocus | null;
  onFocus: (focus: GraphFocus | null) => void;
}

export function GraphDrawing({ layout, focus, onFocus }: GraphDrawingProps) {
  const litNodes = focus && findLitNodes(focus, layout.edges);
  return (
    <svg
      className="graph-svg"
      width={layout.width * layout.scale}
      height={layout.height * layout.scale}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label="The part of the knowledge graph behind this answer"
    >
      <g>
        {layout.edges.toReversed().map((edge) => (
          <GraphEdgeLine
            key={edge.id}
            edge={edge}
            isDimmed={focus !== null && !edgeIsLit(focus, edge)}
            onFocus={onFocus}
          />
        ))}
      </g>
      <g>
        {layout.nodes.map((node) => (
          <GraphNodeMark
            key={node.name}
            node={node}
            isDimmed={litNodes !== null && !litNodes.has(node.name)}
            onFocus={onFocus}
          />
        ))}
      </g>
    </svg>
  );
}
