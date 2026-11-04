import { afterAll, describe, expect, inject, it } from 'vitest';
import { conversations, messages, eq, RelationalStore } from '../src/index.js';

describe('RelationalStore', () => {
  const stores = inject('stores');
  const opened: RelationalStore[] = [];

  afterAll(async () => {
    await Promise.all(opened.map((store) => store.onApplicationShutdown()));
  });

  function open(): RelationalStore {
    const store = new RelationalStore({ connectionString: stores.postgresUrl });
    opened.push(store);
    return store;
  }

  it('applies migrations from several services starting at once', async () => {
    const instances = [open(), open(), open(), open()];

    await Promise.all(instances.map((store) => store.onModuleInit()));

    const rows = await instances[0]!.db.select().from(conversations).limit(1);
    expect(Array.isArray(rows)).toBe(true);
  });

  it('is safe to start again', async () => {
    const store = open();

    await store.onModuleInit();

    await expect(store.onModuleInit()).resolves.toBeUndefined();
  });

  it('deletes messages with their conversation', async () => {
    const store = open();
    await store.onModuleInit();
    const [conversation] = await store.db.insert(conversations).values({}).returning();
    await store.db
      .insert(messages)
      .values({ conversationId: conversation!.id, role: 'user', content: 'Hello' });

    await store.db.delete(conversations).where(eq(conversations.id, conversation!.id));

    const rows = await store.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation!.id));
    expect(rows).toEqual([]);
  });
});
