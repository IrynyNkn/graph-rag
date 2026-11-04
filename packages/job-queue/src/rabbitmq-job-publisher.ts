import { Logger } from '@nestjs/common';
import type { Channel } from 'amqplib';
import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { JobPublisher } from './job-publisher.js';
import { declareQueue } from './queue-declaration.js';

export class RabbitMqJobPublisher extends JobPublisher {
  private readonly logger = new Logger(RabbitMqJobPublisher.name);
  private readonly declared = new Set<string>();
  private readonly channel: ChannelWrapper;

  constructor(connection: AmqpConnectionManager, publishTimeoutMs: number) {
    super();
    this.channel = connection.createChannel({ json: true, publishTimeout: publishTimeoutMs });
    this.channel.on('error', (error) => this.logger.error(`Channel failed: ${String(error)}`));
  }

  async publish(queue: string, job: unknown): Promise<void> {
    await this.declare(queue);
    await this.channel.sendToQueue(queue, job, { persistent: true });
  }

  private async declare(queue: string): Promise<void> {
    if (this.declared.has(queue)) {
      return;
    }
    await this.channel.addSetup((channel: Channel) => declareQueue(channel, queue));
    this.declared.add(queue);
  }
}
