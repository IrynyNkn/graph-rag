import type { Conversation, ConversationDetails } from '@graph-rag/contracts';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ConversationsService } from '../application/conversations/conversations.service.js';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  create(): Promise<Conversation> {
    return this.conversations.create();
  }

  @Get()
  list(): Promise<Conversation[]> {
    return this.conversations.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ConversationDetails> {
    return this.conversations.getDetails(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.conversations.delete(id);
  }
}
