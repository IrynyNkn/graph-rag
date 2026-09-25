import { Body, Controller, Post } from '@nestjs/common';
import { IngestRequestDto } from './dto/ingest-request.dto.js';
import { IngestService } from './ingest.service.js';

@Controller('ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post()
  ingest(@Body() body: IngestRequestDto) {
    return this.ingestService.ingest(body.text);
  }
}
