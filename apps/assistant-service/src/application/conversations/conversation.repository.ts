import type {
  Conversation,
  ConversationDetails,
  Message,
  MessageMetadata,
  MessageRole,
} from '@graph-rag/contracts';

export interface NewMessage {
  role: MessageRole;
  content: string;
  metadata?: MessageMetadata;
}

export interface SummaryState {
  summary: string | null;
  summarisedUpToMessageId: number | null;
}

export abstract class ConversationRepository {
  abstract create(): Promise<Conversation>;
  abstract findAll(): Promise<Conversation[]>;
  abstract findDetails(id: string): Promise<ConversationDetails | null>;
  abstract exists(id: string): Promise<boolean>;
  /** Returns false when there was nothing to delete. */
  abstract delete(id: string): Promise<boolean>;
  /** The first question names the conversation, and later ones leave the title alone. */
  abstract setTitleIfEmpty(id: string, title: string): Promise<void>;
  abstract appendMessage(conversationId: string, message: NewMessage): Promise<Message>;
  /** The message, or null when it is not in this conversation. */
  abstract findMessage(conversationId: string, messageId: number): Promise<Message | null>;
  /**
   * Deletes a message and everything after it. A summary that covered any of them goes too, and a
   * conversation left empty loses its title, so that its next question names it again.
   */
  abstract deleteMessagesFrom(conversationId: string, messageId: number): Promise<void>;
  abstract findSummaryState(id: string): Promise<SummaryState>;
  /** Messages newer than `afterId` and older than `beforeId`, oldest first. */
  abstract findMessagesBetween(
    conversationId: string,
    afterId: number | null,
    beforeId: number,
  ): Promise<Message[]>;
  abstract saveSummary(id: string, summary: string, upToMessageId: number): Promise<void>;
}
