import { Module } from '@nestjs/common';
import { GraphModule } from '../graph/graph.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { QueryController } from './query.controller.js';
import { QueryService } from './query.service.js';

@Module({
  imports: [LlmModule, GraphModule],
  controllers: [QueryController],
  providers: [QueryService],
})
export class QueryModule {}
