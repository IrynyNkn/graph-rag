import { z } from 'zod';
import { messageSchema, queryRouteSchema } from './conversations.js';
import { citationSchema, retrievedGraphSchema } from './retrieved-graph.js';

export const turnEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('analysis'),
    route: queryRouteSchema,
    standaloneQuestion: z.string(),
  }),
  z.object({ type: z.literal('graph'), graph: retrievedGraphSchema }),
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({ type: z.literal('citations'), citations: z.array(citationSchema) }),
  z.object({ type: z.literal('done'), message: messageSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type TurnEvent = z.infer<typeof turnEventSchema>;
