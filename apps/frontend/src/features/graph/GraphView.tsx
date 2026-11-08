import type { RetrievedGraph } from '@graph-rag/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useMemo, type PointerEvent } from 'react';
import { EASE_OUT } from '../../app/motion';
import { EMPTY_LAYOUT, layoutFlow } from './flow/layout';
import { GraphDrawing } from './GraphDrawing';
import { GraphFocusCard } from './GraphFocusCard';
import { GraphHeader, GraphLegend } from './GraphChrome';
import { isStillDrawn } from './graph-focus';
import { useElementSize } from './use-element-size';
import { useHoverFocus } from './use-hover-focus';
import './graph.css';

interface GraphViewProps {
  graph: RetrievedGraph | null;
  isSearching: boolean;
  isAnswering: boolean;
}

/** Memoised, because the page re-renders for every token of an answer and this has many parts. */
export const GraphView = memo(function GraphView({
  graph,
  isSearching,
  isAnswering,
}: GraphViewProps) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const { focus: hovered, enter, leave } = useHoverFocus();
  const layout = useMemo(
    () => (graph && graph.nodes.length > 0 && size.width > 0 ? layoutFlow(graph, size) : null),
    [graph, size],
  );
  // A graph that changes under a still pointer takes its hovered element away without a mouse leave.
  const focus = layout && hovered && isStillDrawn(hovered, layout) ? hovered : null;
  const showsInvitation = layout === null && !isSearching;

  return (
    <section className={isSearching ? 'graph is-searching' : 'graph'}>
      <GraphHeader layout={layout} isSearching={isSearching} />
      <div ref={ref} className="graph-canvas" onPointerMove={followPointer}>
        <div className="graph-dots" />
        <div className="graph-dots is-lit" />
        <GraphDrawing
          layout={layout ?? EMPTY_LAYOUT}
          focus={focus}
          isAnswering={isAnswering}
          onFocus={enter}
          onBlur={leave}
        />
        <AnimatePresence>
          {showsInvitation && (
            <motion.p
              key="invitation"
              className="graph-invitation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            >
              The graph behind an answer appears here.
            </motion.p>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {layout && focus && (
            <GraphFocusCard key="card" focus={focus} layout={layout} panel={size} />
          )}
        </AnimatePresence>
        <AnimatePresence>{layout && <GraphLegend key="legend" />}</AnimatePresence>
      </div>
    </section>
  );
});

/** Written straight to the element, because a re-render per pointer move would be wasteful. */
function followPointer(event: PointerEvent<HTMLDivElement>): void {
  const element = event.currentTarget;
  const box = element.getBoundingClientRect();
  element.style.setProperty('--spot-x', `${event.clientX - box.left}px`);
  element.style.setProperty('--spot-y', `${event.clientY - box.top}px`);
}
