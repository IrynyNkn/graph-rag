import amqp from 'amqplib';

export async function purgeQueues(url: string, queues: string[]): Promise<void> {
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  for (const queue of queues) {
    await channel.assertQueue(queue, { durable: true });
    await channel.purgeQueue(queue);
  }
  await connection.close();
}

/** Takes one job off the queue, or returns null when it is empty. */
export async function takeJob(url: string, queue: string): Promise<unknown> {
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  const message = await channel.get(queue, { noAck: true });
  await connection.close();
  return message === false ? null : JSON.parse(message.content.toString());
}

/** For jobs that a typed publisher could never produce. */
export async function publishRawJob(url: string, queue: string, content: string): Promise<void> {
  const connection = await amqp.connect(url);
  const channel = await connection.createConfirmChannel();
  await channel.assertQueue(queue, { durable: true });
  channel.sendToQueue(queue, Buffer.from(content));
  await channel.waitForConfirms();
  await connection.close();
}
