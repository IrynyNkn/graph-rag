import type { Line } from './edges';

/** A node's label goes on the side that fewer of its lines head towards, so they do not cross it. */
export function findNodesLabelledAbove(lines: Line[]): Set<string> {
  const headingDown = new Map<string, number>();
  const count = (name: string, fromY: number, towardsY: number) => {
    headingDown.set(name, (headingDown.get(name) ?? 0) + Math.sign(towardsY - fromY));
  };
  for (const { from, to } of lines) {
    count(from.name, from.y, to.y);
    count(to.name, to.y, from.y);
  }
  return new Set([...headingDown].flatMap(([name, balance]) => (balance > 0 ? [name] : [])));
}
