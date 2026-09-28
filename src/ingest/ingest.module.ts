import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { GraphModule } from '../graph/graph.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { IngestController } from './ingest.controller.js';
import { IngestService } from './ingest.service.js';

@Module({
  imports: [LlmModule, GraphModule, EmbeddingModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
