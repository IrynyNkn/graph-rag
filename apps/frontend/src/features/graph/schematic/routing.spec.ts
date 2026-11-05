import { describe, expect, it } from 'vitest';
import { routeAcrossColumns, routeWithinColumn, toRoundedPath } from './routing';

const ORIGIN = { x: 0, y: 0 };

describe('routeAcrossColumns', () => {
  it('stays straight between nodes of one row', () => {
    expect(routeAcrossColumns(ORIGIN, { x: 200, y: 0 })).toEqual([ORIGIN, { x: 200, y: 0 }]);
  });

  it('bends at 45 degrees and centers the slant when there is room', () => {
    expect(routeAcrossColumns(ORIGIN, { x: 200, y: 100 })).toEqual([
      ORIGIN,
      { x: 50, y: 0 },
      { x: 150, y: 100 },
      { x: 200, y: 100 },
    ]);
  });

  it('goes up as well as down', () => {
    expect(routeAcrossColumns(ORIGIN, { x: 200, y: -100 })).toEqual([
      ORIGIN,
      { x: 50, y: 0 },
      { x: 150, y: -100 },
      { x: 200, y: -100 },
    ]);
  });

  it('gets a little steeper rather than adding a short vertical run, which looks like a kink', () => {
    expect(routeAcrossColumns(ORIGIN, { x: 200, y: 180 })).toEqual([
      ORIGIN,
      { x: 16, y: 0 },
      { x: 184, y: 180 },
      { x: 200, y: 180 },
    ]);
  });

  it('adds a vertical run when 45 degrees cannot cover the rise', () => {
    expect(routeAcrossColumns(ORIGIN, { x: 200, y: 300 })).toEqual([
      ORIGIN,
      { x: 16, y: 0 },
      { x: 100, y: 84 },
      { x: 100, y: 216 },
      { x: 184, y: 300 },
      { x: 200, y: 300 },
    ]);
  });

  it('keeps lines of one fan from crossing, whichever way they are routed', () => {
    const near = { x: 200, y: 160 };
    const far = { x: 200, y: 300 };
    const heightAt = (points: { x: number; y: number }[], x: number) => {
      const index = points.findIndex((point) => point.x >= x);
      const [a, b] = [points[Math.max(0, index - 1)], points[index]];
      return a && b && b.x > a.x ? a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y) : (a?.y ?? 0);
    };

    for (let x = 0; x <= 200; x += 10) {
      const nearY = heightAt(routeAcrossColumns(ORIGIN, near), x);
      const farY = heightAt(routeAcrossColumns(ORIGIN, far), x);
      expect(farY).toBeGreaterThanOrEqual(nearY);
    }
  });

  it('never runs backwards between columns closer than two straight runs', () => {
    const xs = routeAcrossColumns(ORIGIN, { x: 60, y: 300 }).map((point) => point.x);

    expect(xs).toEqual(xs.toSorted((a, b) => a - b));
    expect(xs.at(-1)).toBe(60);
  });
});

describe('routeWithinColumn', () => {
  it('bulges out on the requested side', () => {
    const right = routeWithinColumn(ORIGIN, { x: 0, y: 100 }, 'right', 100);
    const left = routeWithinColumn(ORIGIN, { x: 0, y: 100 }, 'left', 100);

    expect(Math.max(...right.map((point) => point.x))).toBeGreaterThan(0);
    expect(Math.min(...left.map((point) => point.x))).toBeLessThan(0);
  });

  it('reaches further for nodes further apart, so that arcs nest', () => {
    const near = routeWithinColumn(ORIGIN, { x: 0, y: 100 }, 'right', 100);
    const far = routeWithinColumn(ORIGIN, { x: 0, y: 300 }, 'right', 100);

    expect(Math.max(...far.map((point) => point.x))).toBeGreaterThan(
      Math.max(...near.map((point) => point.x)),
    );
  });
});

describe('toRoundedPath', () => {
  it('is empty without points', () => {
    expect(toRoundedPath([])).toBe('');
  });

  it('draws a straight line without corners', () => {
    expect(toRoundedPath([ORIGIN, { x: 100, y: 0 }])).toBe('M 0 0 L 100 0');
  });

  it('rounds each corner', () => {
    expect(toRoundedPath([ORIGIN, { x: 56, y: 0 }, { x: 56, y: 56 }])).toBe(
      'M 0 0 L 42 0 Q 56 0 56 14 L 56 56',
    );
  });

  it('keeps a corner within half of a short run', () => {
    expect(toRoundedPath([ORIGIN, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe(
      'M 0 0 L 5 0 Q 10 0 10 5 L 10 10',
    );
  });
});
