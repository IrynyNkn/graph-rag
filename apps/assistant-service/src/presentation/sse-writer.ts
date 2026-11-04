import type { TurnEvent } from '@graph-rag/contracts';
import type { Response } from 'express';

export class SseWriter {
  constructor(private readonly response: Response) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.flushHeaders();
  }

  write(event: TurnEvent): void {
    this.response.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  end(): void {
    this.response.end();
  }
}
