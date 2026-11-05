const DOT_STEP = 11;
const MAX_DOT_RADIUS = 5.2;
const MIN_DOT_RADIUS = 0.9;

/** A disc of printed dots that shrink towards its lower edge, as a halftone gradient does. */
export function Halftone({ diameter }: { diameter: number }) {
  const radius = diameter / 2;
  const positions = Array.from({ length: Math.ceil(diameter / DOT_STEP) }, (_, index) => index);
  return (
    <svg
      className="halftone"
      width={diameter}
      height={diameter}
      viewBox={`0 0 ${diameter} ${diameter}`}
      aria-hidden="true"
    >
      {positions.flatMap((row) =>
        positions.flatMap((column) => {
          const x = (column + 0.5) * DOT_STEP + (row % 2 === 0 ? 0 : DOT_STEP / 2);
          const y = (row + 0.5) * DOT_STEP;
          if (Math.hypot(x - radius, y - radius) > radius) {
            return [];
          }
          const size = MAX_DOT_RADIUS - (y / diameter) * (MAX_DOT_RADIUS - MIN_DOT_RADIUS);
          return [<circle key={`${row}:${column}`} cx={x} cy={y} r={size} />];
        }),
      )}
    </svg>
  );
}
