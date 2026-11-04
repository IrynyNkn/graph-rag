import { z } from 'zod';

export const graphNodeSchema = z.object({
  name: z.string(),
  type: z.string().nullable(),
  description: z.string().nullable(),
  activation: z.number(),
  isSeed: z.boolean(),
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  relations: z.array(z.string()),
  chunkIds: z.array(z.string()),
  weight: z.number(),
});
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const retrievedGraphSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});
export type RetrievedGraph = z.infer<typeof retrievedGraphSchema>;

export const citationSchema = z.object({
  chunkId: z.string(),
  documentId: z.string(),
  documentName: z.string(),
  text: z.string(),
});
export type Citation = z.infer<typeof citationSchema>;
