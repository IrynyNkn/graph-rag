import type { Conversation, ConversationDetails, Message } from '@graph-rag/contracts';
import {
  ConversationRepository,
  type NewMessage,
  type SummaryState,
} from '../src/application/conversations/conversation.repository.js';

interface Row extends Conversation, SummaryState {
  messages: Message[];
}

const TIMESTAMP = '2026-01-01T00:00:00.000Z';

export class FakeConversationRepository extends ConversationRepository {
  readonly rows = new Map<string, Row>();
  private nextMessageId = 1;

  add(id: string, overrides: Partial<SummaryState> = {}): void {
    this.rows.set(id, {
      id,
      title: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      summary: null,
      summarisedUpToMessageId: null,
      messages: [],
      ...overrides,
    });
  }

  async create(): Promise<Conversation> {
    const id = `conversation-${this.rows.size + 1}`;
    this.add(id);
    return this.require(id);
  }

  async findAll(): Promise<Conversation[]> {
    return [...this.rows.values()];
  }

  async findDetails(id: string): Promise<ConversationDetails | null> {
    return this.rows.get(id) ?? null;
  }

  async exists(id: string): Promise<boolean> {
    return this.rows.has(id);
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  async setTitleIfEmpty(id: string, title: string): Promise<void> {
    const row = this.require(id);
    row.title ??= title;
  }

  async appendMessage(conversationId: string, message: NewMessage): Promise<Message> {
    const stored: Message = {
      id: this.nextMessageId,
      role: message.role,
      content: message.content,
      metadata: message.metadata ?? null,
      createdAt: TIMESTAMP,
    };
    this.nextMessageId += 1;
    this.require(conversationId).messages.push(stored);
    return stored;
  }

  async findSummaryState(id: string): Promise<SummaryState> {
    return this.require(id);
  }

  async findMessagesBetween(
    conversationId: string,
    afterId: number | null,
    beforeId: number,
  ): Promise<Message[]> {
    return this.require(conversationId).messages.filter(
      (message) => message.id < beforeId && (afterId === null || message.id > afterId),
    );
  }

  async saveSummary(id: string, summary: string, upToMessageId: number): Promise<void> {
    Object.assign(this.require(id), { summary, summarisedUpToMessageId: upToMessageId });
  }

  private require(id: string): Row {
    const row = this.rows.get(id);
    if (row === undefined) {
      throw new Error(`No conversation ${id}`);
    }
    return row;
  }
}
