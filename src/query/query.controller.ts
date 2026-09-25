import { Body, Controller, Post } from '@nestjs/common';
import { QueryRequestDto } from './dto/query-request.dto.js';
import { QueryService } from './query.service.js';

@Controller('query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post()
  query(@Body() body: QueryRequestDto) {
    return this.queryService.query(body.question);
  }
}
