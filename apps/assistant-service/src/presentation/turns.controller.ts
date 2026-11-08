import { sendMessageRequestSchema, type SendMessageRequest } from '@graph-rag/contracts';
import { ZodValidationPipe } from '@graph-rag/nest-common';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { TurnService } from '../application/turns/turn.service.js';
import { SseWriter } from './sse-writer.js';

@Controller('conversations/:id/turns')
export class TurnsController {
  constructor(private readonly turns: TurnService) {}

  @Post()
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendMessageRequestSchema)) body: SendMessageRequest,
    @Res() response: Response,
  ): Promise<void> {
    const events = await this.turns.start(id, body);
    const writer = new SseWriter(response);
    // A closed tab should not keep the model generating an answer nobody will read.
    response.on('close', () => {
      void events.return(undefined);
    });
    for await (const event of events) {
      writer.write(event);
    }
    writer.end();
  }

  /** Nothing running is not an error: the turn may have just finished on its own. */
  @Post('stop')
  @HttpCode(HttpStatus.NO_CONTENT)
  stop(@Param('id', ParseUUIDPipe) id: string): void {
    this.turns.stop(id);
  }
}
