import { NotFoundError } from '@graph-rag/nest-common';

export class ConversationNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Conversation ${id} does not exist`);
  }
}

export class QuestionNotFoundError extends NotFoundError {
  constructor(conversationId: string, messageId: number) {
    super(`Conversation ${conversationId} has no question ${messageId}`);
  }
}
