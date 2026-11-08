import { animate, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import type { FlowLayout } from './flow/layout';

const COUNT_SECONDS = 0.6;

interface GraphHeaderProps {
  layout: FlowLayout | null;
  isSearching: boolean;
}

export function GraphHeader({ layout, isSearching }: GraphHeaderProps) {
  return (
    <header className="graph-header">
      <h2>Knowledge graph</h2>
      {isSearching && <span className="shimmer">Searching</span>}
      {!isSearching && layout && (
        <span className="graph-counts">
          <Count value={layout.nodes.length} /> entities
          <i aria-hidden="true" />
          <Count value={layout.edges.length} /> relations
        </span>
      )}
    </header>
  );
}

function Count({ value }: { value: number }) {
  const element = useRef<HTMLElement>(null);
  const shown = useRef(0);

  useEffect(() => {
    const controls = animate(shown.current, value, {
      duration: COUNT_SECONDS,
      ease: 'easeOut',
      onUpdate: (latest) => {
        shown.current = latest;
        if (element.current !== null) {
          element.current.textContent = String(Math.round(latest));
        }
      },
    });
    return () => controls.stop();
  }, [value]);

  return <b ref={element}>{value}</b>;
}

export function GraphLegend() {
  return (
    <motion.dl
      className="graph-legend"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, delay: 0.5 }}
    >
      <div>
        <dt className="legend-seed" />
        <dd>Seed</dd>
      </div>
      <div>
        <dt className="legend-link" />
        <dd>Heavier is stronger</dd>
      </div>
      <div>
        <dt className="legend-path" />
        <dd>Strongest path</dd>
      </div>
    </motion.dl>
  );
}
