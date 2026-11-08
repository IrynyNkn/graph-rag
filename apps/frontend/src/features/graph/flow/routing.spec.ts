import { describe, expect, it } from 'vitest';
import { curveAcross, curveBeside } from './routing';

describe('curveAcross', () => {
  it('leaves and arrives level, halfway across', () => {
    expect(curveAcross({ x: 0, y: 10 }, { x: 100, y: 50 }).path).toBe(
      'M 0.0 10.0 C 50.0 10.0 50.0 50.0 100.0 50.0',
    );
  });

  it('has its middle between its ends', () => {
    expect(curveAcross({ x: 0, y: 10 }, { x: 100, y: 50 }).middle).toEqual({ x: 50, y: 30 });
  });
});

describe('curveBeside', () => {
  it('bows out to the right by its reach', () => {
    expect(curveBeside({ x: 10, y: 0 }, { x: 10, y: 40 }, 30).path).toBe(
      'M 10.0 0.0 C 40.0 0.0 40.0 40.0 10.0 40.0',
    );
  });

  it('has its middle out on the bow', () => {
    expect(curveBeside({ x: 10, y: 0 }, { x: 10, y: 40 }, 32).middle).toEqual({ x: 34, y: 20 });
  });
});
