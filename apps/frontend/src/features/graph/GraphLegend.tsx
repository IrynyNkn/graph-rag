export function GraphLegend() {
  return (
    <div className="graph-legend">
      <span>
        <i className="legend-seed" /> matches the question
      </span>
      <span>
        <i className="legend-node" /> reached, bigger is stronger
      </span>
      <span>
        <i className="legend-edge" /> relation, thicker is stronger
      </span>
      <span>
        <i className="legend-strongest" /> strongest path
      </span>
    </div>
  );
}
