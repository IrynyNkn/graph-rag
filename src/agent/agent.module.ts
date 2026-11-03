import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module.js';
import { GraphModule } from '../graph/graph.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { AgentService } from './agent.service.js';

@Module({
  imports: [GraphModule, EmbeddingModule, LlmModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
