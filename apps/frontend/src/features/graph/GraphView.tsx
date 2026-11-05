import type { RetrievedGraph } from '@graph-rag/contracts';
import { useMemo, useState } from 'react';
import { Halftone } from '../../app/Halftone';
import { GraphDrawing } from './GraphDrawing';
import { GraphFocusCard, type GraphFocus } from './GraphFocusCard';
import { GraphLegend } from './GraphLegend';
import { findCardSide, isStillDrawn } from './graph-focus';
import { layoutSchematic } from './schematic/layout';
import { useElementSize } from './use-element-size';
import './graph.css';

export function GraphView({ graph }: { graph: RetrievedGraph | null }) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const [hovered, setHovered] = useState<GraphFocus | null>(null);
  const layout = useMemo(
    () => (graph && size.width > 0 ? layoutSchematic(graph, size) : null),
    [graph, size],
  );
  const drawn = layout !== null && layout.nodes.length > 0 ? layout : null;
  // A graph that changes under a still pointer takes its hovered element away without a mouse leave.
  const focus = drawn && hovered && isStillDrawn(hovered, drawn) ? hovered : null;

  return (
    <div className="graph">
      <div ref={ref} className="graph-canvas">
        {drawn ? (
          // The key restarts the drawing animation when another graph comes in.
          <GraphDrawing
            key={drawn.nodes.map((node) => node.name).join('\n')}
            layout={drawn}
            focus={focus}
            onFocus={setHovered}
          />
        ) : (
          <div className="graph-empty">
            <Halftone diameter={260} />
            <p>The path behind an answer prints here.</p>
          </div>
        )}
      </div>
      {drawn && <GraphLegend />}
      {drawn && focus && <GraphFocusCard focus={focus} side={findCardSide(focus, drawn.width)} />}
    </div>
  );
}
