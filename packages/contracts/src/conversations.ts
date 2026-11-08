import { z } from 'zod';
import { citationSchema, retrievedGraphSchema } from './retrieved-graph.js';

export const queryRouteSchema = z.enum(['knowledge_base', 'conversation']);
export type QueryRoute = z.infer<typeof queryRouteSchema>;

export const messageRoleSchema = z.enum(['user', 'assistant']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageMetadataSchema = z.object({
  route: queryRouteSchema,
  standaloneQuestion: z.string(),
  graph: retrievedGraphSchema.nullable(),
  citations: z.array(citationSchema),
  /** The user stopped the answer, and this is what was written until then. */
  stopped: z.boolean().optional(),
});
export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export const messageSchema = z.object({
  id: z.number().int(),
  role: messageRoleSchema,
  content: z.string(),
  metadata: messageMetadataSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const conversationDetailsSchema = conversationSchema.extend({
  messages: z.array(messageSchema),
});
export type ConversationDetails = z.infer<typeof conversationDetailsSchema>;

export const sendMessageRequestSchema = z.object({
  content: z.string().trim().min(1),
  /** Asks a question again or edits it: the turn replaces this question and everything after it. */
  replacesFromMessageId: z.number().int().positive().optional(),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
