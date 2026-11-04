import type {
  Conversation,
  ConversationDetails,
  Message,
  MessageMetadata,
} from '@graph-rag/contracts';
import { Injectable } from '@nestjs/common';
import { ConversationRepository } from './conversation.repository.js';
import { ConversationNotFoundError } from './errors.js';

const TITLE_MAX_CHARS = 60;

@Injectable()
export class ConversationsService {
  constructor(private readonly conversations: ConversationRepository) {}

  create(): Promise<Conversation> {
    return this.conversations.create();
  }

  list(): Promise<Conversation[]> {
    return this.conversations.findAll();
  }

  async getDetails(id: string): Promise<ConversationDetails> {
    const details = await this.conversations.findDetails(id);
    if (details === null) {
      throw new ConversationNotFoundError(id);
    }
    return details;
  }

  async delete(id: string): Promise<void> {
    if (!(await this.conversations.delete(id))) {
      throw new ConversationNotFoundError(id);
    }
  }

  async ensureExists(id: string): Promise<void> {
    if (!(await this.conversations.exists(id))) {
      throw new ConversationNotFoundError(id);
    }
  }

  async appendUserMessage(conversationId: string, content: string): Promise<Message> {
    await this.conversations.setTitleIfEmpty(conversationId, toTitle(content));
    return this.conversations.appendMessage(conversationId, { role: 'user', content });
  }

  appendAssistantMessage(
    conversationId: string,
    content: string,
    metadata: MessageMetadata,
  ): Promise<Message> {
    return this.conversations.appendMessage(conversationId, {
      role: 'assistant',
      content,
      metadata,
    });
  }
}

function toTitle(content: string): string {
  return content.length > TITLE_MAX_CHARS ? `${content.slice(0, TITLE_MAX_CHARS)}...` : content;
}
