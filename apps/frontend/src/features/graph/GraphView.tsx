import type { RetrievedGraph } from '@graph-rag/contracts';
import { useEffect, useMemo, useRef } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d';
import {
  describeLink,
  describeNode,
  toForceGraphData,
  type ForceGraphData,
  type ForceLink,
  type ForceNode,
} from './force-graph-data';
import { useElementSize } from './use-element-size';

const SEED_COLOR = '#d9480f';
const NODE_COLOR = '#1c7ed6';
const LINK_COLOR = '#adb5bd';
const LABEL_COLOR = '#212529';
const LABEL_FONT_PX = 11;
const ARROW_LENGTH = 4;
// Spread out enough for the labels to stay readable, and settled quickly on a modest laptop.
// The limited range keeps parts of the graph that are not connected from flying apart.
const CHARGE_STRENGTH = -200;
const CHARGE_RANGE = 220;
const LINK_DISTANCE = 70;
const WARMUP_TICKS = 60;
const COOLDOWN_MS = 2000;
const ZOOM_DURATION_MS = 300;
const ZOOM_PADDING_PX = 40;

type DrawnNode = NodeObject<ForceNode>;

function drawNode(node: DrawnNode, context: CanvasRenderingContext2D, scale: number): void {
  const { x = 0, y = 0, radius, isSeed, id } = node;
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI);
  context.fillStyle = isSeed ? SEED_COLOR : NODE_COLOR;
  context.fill();
  context.font = `${LABEL_FONT_PX / scale}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillStyle = LABEL_COLOR;
  context.fillText(id, x, y + radius + 1);
}

function drawHitArea(node: DrawnNode, color: string, context: CanvasRenderingContext2D): void {
  context.fillStyle = color;
  context.beginPath();
  context.arc(node.x ?? 0, node.y ?? 0, node.radius, 0, 2 * Math.PI);
  context.fill();
}

export function GraphView({ graph }: { graph: RetrievedGraph | null }) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  // The library adds coordinates to these objects, so they must survive re-renders.
  const data = useMemo(() => toForceGraphData(graph ?? { nodes: [], edges: [] }), [graph]);

  return (
    <div ref={ref} className="graph">
      {data.nodes.length === 0 && (
        <p className="graph-empty muted">The graph behind an answer appears here.</p>
      )}
      {/* Fitting into a canvas of no size zooms out to nothing, so the canvas waits for its size. */}
      {size.width > 0 && size.height > 0 && (
        <GraphCanvas data={data} width={size.width} height={size.height} />
      )}
    </div>
  );
}

interface GraphCanvasProps {
  data: ForceGraphData;
  width: number;
  height: number;
}

function GraphCanvas({ data, width, height }: GraphCanvasProps) {
  const engine = useRef<ForceGraphMethods<ForceNode, ForceLink> | undefined>(undefined);

  useEffect(() => {
    engine.current?.d3Force('charge')?.strength(CHARGE_STRENGTH).distanceMax(CHARGE_RANGE);
    engine.current?.d3Force('link')?.distance(LINK_DISTANCE);
  }, []);

  return (
    <ForceGraph2D<ForceNode, ForceLink>
      ref={engine}
      graphData={data}
      width={width}
      height={height}
      warmupTicks={WARMUP_TICKS}
      cooldownTime={COOLDOWN_MS}
      onEngineStop={() => engine.current?.zoomToFit(ZOOM_DURATION_MS, ZOOM_PADDING_PX)}
      nodeLabel={describeNode}
      nodeCanvasObject={drawNode}
      nodePointerAreaPaint={drawHitArea}
      linkLabel={describeLink}
      linkWidth="width"
      linkColor={() => LINK_COLOR}
      linkDirectionalArrowLength={ARROW_LENGTH}
      linkDirectionalArrowRelPos={1}
    />
  );
}
