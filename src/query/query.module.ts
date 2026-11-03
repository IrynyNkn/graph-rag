import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module.js';
import { QueryController } from './query.controller.js';
import { QueryService } from './query.service.js';

@Module({
  imports: [AgentModule],
  controllers: [QueryController],
  providers: [QueryService],
})
export class QueryModule {}
