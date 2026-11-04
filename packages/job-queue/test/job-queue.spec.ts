import { randomUUID } from 'node:crypto';
import { publishRawJob } from '@graph-rag/testing';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { z } from 'zod';
import { JobConsumer, JobPublisher, JobQueueModule } from '../src/index.js';

const jobSchema = z.object({ value: z.number() });
const WAIT = { timeout: 10_000, interval: 20 };

describe('job queue', () => {
  const stores = inject('stores');
  let moduleRef: TestingModule;
  let publisher: JobPublisher;
  let consumer: JobConsumer;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [JobQueueModule.forRoot({ url: stores.rabbitMqUrl, redeliveryDelayMs: 10 })],
    }).compile();
    moduleRef.useLogger(false);
    await moduleRef.init();
    publisher = moduleRef.get(JobPublisher);
    consumer = moduleRef.get(JobConsumer);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const newQueue = () => `test.${randomUUID()}`;

  it('delivers a published job', async () => {
    const queue = newQueue();
    const received: unknown[] = [];
    await consumer.consume(queue, jobSchema, async (job) => {
      received.push(job);
    });

    await publisher.publish(queue, { value: 1 });

    await vi.waitFor(() => expect(received).toEqual([{ value: 1 }]), WAIT);
  });

  it('keeps jobs published before the consumer starts', async () => {
    const queue = newQueue();
    await publisher.publish(queue, { value: 2 });
    const received: unknown[] = [];

    await consumer.consume(queue, jobSchema, async (job) => {
      received.push(job);
    });

    await vi.waitFor(() => expect(received).toEqual([{ value: 2 }]), WAIT);
  });

  it('handles one job at a time', async () => {
    const queue = newQueue();
    let running = 0;
    let peak = 0;
    let handled = 0;
    await consumer.consume(queue, jobSchema, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running -= 1;
      handled += 1;
    });

    await Promise.all([1, 2, 3].map((value) => publisher.publish(queue, { value })));

    await vi.waitFor(() => expect(handled).toBe(3), WAIT);
    expect(peak).toBe(1);
  });

  it('delivers a job again when its handler throws', async () => {
    const queue = newQueue();
    let attempts = 0;
    await consumer.consume(queue, jobSchema, async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('store is down');
      }
    });

    await publisher.publish(queue, { value: 3 });

    await vi.waitFor(() => expect(attempts).toBe(2), WAIT);
  });

  it('drops a malformed job and keeps consuming', async () => {
    const queue = newQueue();
    const received: unknown[] = [];
    await consumer.consume(queue, jobSchema, async (job) => {
      received.push(job);
    });

    await publishRawJob(stores.rabbitMqUrl, queue, 'not json');
    await publishRawJob(stores.rabbitMqUrl, queue, '{"value":"not a number"}');
    await publisher.publish(queue, { value: 4 });

    await vi.waitFor(() => expect(received).toEqual([{ value: 4 }]), WAIT);
  });
});
