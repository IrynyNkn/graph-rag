import type { Conversation, ConversationDetails, Message } from '@graph-rag/contracts';
import {
  and,
  asc,
  conversations,
  count,
  desc,
  eq,
  gt,
  gte,
  lt,
  messages,
  RelationalStore,
  sql,
} from '@graph-rag/relational-store';
import { Injectable } from '@nestjs/common';
import {
  ConversationRepository,
  type NewMessage,
  type SummaryState,
} from '../../application/conversations/conversation.repository.js';

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

const NO_SUMMARY: SummaryState = { summary: null, summarisedUpToMessageId: null };

@Injectable()
export class RelationalConversationRepository extends ConversationRepository {
  constructor(private readonly store: RelationalStore) {
    super();
  }

  async create(): Promise<Conversation> {
    const [row] = await this.store.db.insert(conversations).values({}).returning();
    if (row === undefined) {
      throw new Error('Inserting a conversation returned no row');
    }
    return toConversation(row);
  }

  async findAll(): Promise<Conversation[]> {
    const rows = await this.store.db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt));
    return rows.map(toConversation);
  }

  async findDetails(id: string): Promise<ConversationDetails | null> {
    const [row] = await this.store.db.select().from(conversations).where(eq(conversations.id, id));
    if (row === undefined) {
      return null;
    }
    const messageRows = await this.store.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.id));
    return { ...toConversation(row), messages: messageRows.map(toMessage) };
  }

  async exists(id: string): Promise<boolean> {
    const rows = await this.store.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, id));
    return rows.length > 0;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.store.db
      .delete(conversations)
      .where(eq(conversations.id, id))
      .returning({ id: conversations.id });
    return rows.length > 0;
  }

  async setTitleIfEmpty(id: string, title: string): Promise<void> {
    await this.store.db
      .update(conversations)
      .set({ title: sql`coalesce(${conversations.title}, ${title})` })
      .where(eq(conversations.id, id));
  }

  async appendMessage(conversationId: string, message: NewMessage): Promise<Message> {
    return this.store.db.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(messages)
        .values({ ...message, conversationId })
        .returning();
      if (row === undefined) {
        throw new Error('Inserting a message returned no row');
      }
      await transaction
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
      return toMessage(row);
    });
  }

  async findMessage(conversationId: string, messageId: number): Promise<Message | null> {
    const [row] = await this.store.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.id, messageId)));
    return row === undefined ? null : toMessage(row);
  }

  async deleteMessagesFrom(conversationId: string, messageId: number): Promise<void> {
    await this.store.db.transaction(async (transaction) => {
      await transaction
        .delete(messages)
        .where(and(eq(messages.conversationId, conversationId), gte(messages.id, messageId)));
      const [left] = await transaction
        .select({ total: count() })
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      const isStale = sql`${conversations.summarisedUpToMessageId} >= ${messageId}`;
      await transaction
        .update(conversations)
        .set({
          title: left?.total === 0 ? null : conversations.title,
          summary: sql`case when ${isStale} then null else ${conversations.summary} end`,
          summarisedUpToMessageId: sql`case when ${isStale} then null else ${conversations.summarisedUpToMessageId} end`,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));
    });
  }

  async findSummaryState(id: string): Promise<SummaryState> {
    const [row] = await this.store.db
      .select({
        summary: conversations.summary,
        summarisedUpToMessageId: conversations.summarisedUpToMessageId,
      })
      .from(conversations)
      .where(eq(conversations.id, id));
    return row ?? NO_SUMMARY;
  }

  async findMessagesBetween(
    conversationId: string,
    afterId: number | null,
    beforeId: number,
  ): Promise<Message[]> {
    const rows = await this.store.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          lt(messages.id, beforeId),
          afterId === null ? undefined : gt(messages.id, afterId),
        ),
      )
      .orderBy(asc(messages.id));
    return rows.map(toMessage);
  }

  async saveSummary(id: string, summary: string, upToMessageId: number): Promise<void> {
    await this.store.db
      .update(conversations)
      .set({ summary, summarisedUpToMessageId: upToMessageId })
      .where(eq(conversations.id, id));
  }
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}
