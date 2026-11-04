import { Inject, Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import { connect, type AmqpConnectionManager } from 'amqp-connection-manager';
import { JobConsumer } from './job-consumer.js';
import { JobPublisher } from './job-publisher.js';
import { RabbitMqJobConsumer } from './rabbitmq-job-consumer.js';
import { RabbitMqJobPublisher } from './rabbitmq-job-publisher.js';

const JOB_QUEUE_CONNECTION = Symbol('JOB_QUEUE_CONNECTION');
const DEFAULT_PUBLISH_TIMEOUT_MS = 5000;
const DEFAULT_REDELIVERY_DELAY_MS = 5000;

export interface JobQueueOptions {
  url: string;
  publishTimeoutMs?: number;
  /** A job fails like this only while a store is down, so a pause avoids spinning on it. */
  redeliveryDelayMs?: number;
}

@Module({})
export class JobQueueModule implements OnApplicationShutdown {
  constructor(@Inject(JOB_QUEUE_CONNECTION) private readonly connection: AmqpConnectionManager) {}

  static forRoot(options: JobQueueOptions): DynamicModule {
    return {
      module: JobQueueModule,
      providers: [
        { provide: JOB_QUEUE_CONNECTION, useFactory: () => connect([options.url]) },
        {
          provide: JobPublisher,
          inject: [JOB_QUEUE_CONNECTION],
          useFactory: (connection: AmqpConnectionManager) =>
            new RabbitMqJobPublisher(
              connection,
              options.publishTimeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS,
            ),
        },
        {
          provide: JobConsumer,
          inject: [JOB_QUEUE_CONNECTION],
          useFactory: (connection: AmqpConnectionManager) =>
            new RabbitMqJobConsumer(
              connection,
              options.redeliveryDelayMs ?? DEFAULT_REDELIVERY_DELAY_MS,
            ),
        },
      ],
      exports: [JobPublisher, JobConsumer],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}
