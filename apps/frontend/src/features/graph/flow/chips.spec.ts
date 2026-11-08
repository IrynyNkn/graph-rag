import { describe, expect, it } from 'vitest';
import { estimateTextWidth, measureChip } from './chips';

describe('estimateTextWidth', () => {
  it.each([
    ['Billing Engine', 77],
    ['Marcus Webb', 77],
    ['Priya Nair', 55],
    ['Compliance Audit Risk', 127],
    ['Finance and Operations', 133],
  ])('stays close to the width of %s in the real font', (text, measured) => {
    const estimate = estimateTextWidth(text);

    expect(estimate).toBeGreaterThan(measured * 0.92);
    expect(estimate).toBeLessThan(measured * 1.08);
  });
});

describe('measureChip', () => {
  it('shows a name as it should read', () => {
    expect(measureChip('billing engine').lines).toEqual(['Billing Engine']);
  });

  it('wraps a long name, and grows taller for it', () => {
    const short = measureChip('search team');
    const long = measureChip('finance and operations department');

    expect(long.lines).toEqual(['Finance and Operations', 'Department']);
    expect(long.height).toBeGreaterThan(short.height);
  });

  it('starts lines inside a chip, and takes more room than the text needs', () => {
    const chip = measureChip('billing engine');

    expect(chip.exitOffset).toBeLessThan(chip.width);
    expect(chip.width).toBeGreaterThan(estimateTextWidth('Billing Engine'));
  });
});
