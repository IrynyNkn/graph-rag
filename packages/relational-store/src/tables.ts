import type { DocumentFileType, DocumentStatus, MessageMetadata } from '@graph-rag/contracts';
import { bigint, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  contentHash: text('content_hash').notNull().unique(),
  type: text('type').$type<DocumentFileType>().notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  status: text('status').$type<DocumentStatus>().notNull(),
  chunksTotal: integer('chunks_total').notNull().default(0),
  chunksDone: integer('chunks_done').notNull().default(0),
  chunksFailed: integer('chunks_failed').notNull().default(0),
  error: text('error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title'),
  summary: text('summary'),
  summarisedUpToMessageId: bigint('summarised_up_to_message_id', { mode: 'number' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const messages = pgTable('messages', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').$type<'user' | 'assistant'>().notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').$type<MessageMetadata>(),
  createdAt: createdAt(),
});
