import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.js';
import { GraphModule } from './graph/graph.module.js';
import { IngestModule } from './ingest/ingest.module.js';
import { LlmModule } from './llm/llm.module.js';
import { QueryModule } from './query/query.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    LlmModule,
    GraphModule,
    IngestModule,
    QueryModule,
  ],
})
export class AppModule {}
