import { Controller, Get } from '@nestjs/common';

/** A service only starts listening after its stores are ready, so answering means healthy. */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
