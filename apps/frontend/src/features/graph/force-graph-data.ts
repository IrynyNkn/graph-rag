import type { RetrievedGraph } from '@graph-rag/contracts';

const MIN_RADIUS = 3;
const MAX_RADIUS = 11;
const MIN_LINK_WIDTH = 0.5;
const MAX_LINK_WIDTH = 4;

export interface ForceNode {
  id: string;
  type: string | null;
  description: string | null;
  activation: number;
  isSeed: boolean;
  radius: number;
}

export interface ForceLink {
  source: string;
  target: string;
  relations: string[];
  weight: number;
  width: number;
}

export interface ForceGraphData {
  nodes: ForceNode[];
  links: ForceLink[];
}

/** Node size comes from QASA activation and link width from path weight, scaled to the graph. */
export function toForceGraphData({ nodes, edges }: RetrievedGraph): ForceGraphData {
  const maxActivation = Math.max(...nodes.map((node) => node.activation), 0);
  const maxWeight = Math.max(...edges.map((edge) => edge.weight), 0);
  return {
    nodes: nodes.map((node) => ({
      id: node.name,
      type: node.type,
      description: node.description,
      activation: node.activation,
      isSeed: node.isSeed,
      radius: scale(node.activation, maxActivation, MIN_RADIUS, MAX_RADIUS),
    })),
    links: edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      relations: edge.relations,
      weight: edge.weight,
      width: scale(edge.weight, maxWeight, MIN_LINK_WIDTH, MAX_LINK_WIDTH),
    })),
  };
}

function scale(value: number, max: number, low: number, high: number): number {
  return max > 0 ? low + (value / max) * (high - low) : low;
}

export function describeNode({ id, type, activation, description }: ForceNode): string {
  const header = `${id}${type ? ` (${type})` : ''}, activation ${activation.toFixed(2)}`;
  return description ? `${header}\n${description}` : header;
}

export function describeLink({ relations, weight }: ForceLink): string {
  return `${relations.join(', ')}, weight ${weight.toFixed(2)}`;
}
