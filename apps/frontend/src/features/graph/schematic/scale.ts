export function scale(value: number, all: number[], low: number, high: number): number {
  const max = Math.max(0, ...all);
  return max > 0 ? low + (value / max) * (high - low) : low;
}
