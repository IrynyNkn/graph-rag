import { setTimeout as delay } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import type { Channel, ConsumeMessage } from 'amqplib';
import type { AmqpConnectionManager } from 'amqp-connection-manager';
import type { ZodType } from 'zod';
import { JobConsumer, type JobHandler } from './job-consumer.js';
import { declareQueue } from './queue-declaration.js';

export class RabbitMqJobConsumer extends JobConsumer {
  private readonly logger = new Logger(RabbitMqJobConsumer.name);

  constructor(
    private readonly connection: AmqpConnectionManager,
    private readonly redeliveryDelayMs: number,
  ) {
    super();
  }

  async consume<T>(queue: string, schema: ZodType<T>, handler: JobHandler<T>): Promise<void> {
    const wrapper = this.connection.createChannel({
      setup: async (channel: Channel) => {
        await declareQueue(channel, queue);
        await channel.prefetch(1);
        await channel.consume(queue, (message) => {
          if (message) {
            void this.process(channel, message, schema, handler);
          }
        });
      },
    });
    wrapper.on('error', (error) =>
      this.logger.error(`Channel of ${queue} failed: ${String(error)}`),
    );
    await wrapper.waitForConnect();
  }

  private async process<T>(
    channel: Channel,
    message: ConsumeMessage,
    schema: ZodType<T>,
    handler: JobHandler<T>,
  ): Promise<void> {
    const job = this.parse(message, schema);
    if (job === undefined) {
      this.settle(() => channel.ack(message));
      return;
    }
    try {
      await handler(job.value);
      this.settle(() => channel.ack(message));
    } catch (error) {
      this.logger.error(`Job failed and will be delivered again: ${String(error)}`);
      await delay(this.redeliveryDelayMs);
      this.settle(() => channel.nack(message));
    }
  }

  /** A malformed job would fail on every delivery, so it is logged and dropped. */
  private parse<T>(message: ConsumeMessage, schema: ZodType<T>): { value: T } | undefined {
    try {
      return { value: schema.parse(JSON.parse(message.content.toString())) };
    } catch (error) {
      this.logger.error(`Dropping a malformed job: ${String(error)}`);
      return undefined;
    }
  }

  /** On a closed channel the broker has already requeued the message. */
  private settle(acknowledge: () => void): void {
    try {
      acknowledge();
    } catch (error) {
      this.logger.warn(`Could not acknowledge a job: ${String(error)}`);
    }
  }
}
