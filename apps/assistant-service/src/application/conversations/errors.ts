import { NotFoundError } from '@graph-rag/nest-common';

export class ConversationNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Conversation ${id} does not exist`);
  }
}
