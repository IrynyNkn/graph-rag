import type { Channel } from 'amqplib';

export async function declareQueue(channel: Channel, queue: string): Promise<void> {
  await channel.assertQueue(queue, { durable: true });
}
