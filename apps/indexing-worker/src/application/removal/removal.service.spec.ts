import { InMemoryFileStore } from '@graph-rag/testing';
import { describe, expect, it } from 'vitest';
import type { KnowledgeRefresher } from '../knowledge/knowledge-refresher.js';
import { FakeDocumentStatusRepository } from '../../../test/fake-document-status.repository.js';
import { DocumentGraphRepository } from './document-graph.repository.js';
import { RemovalService } from './removal.service.js';

class RecordingGraph extends DocumentGraphRepository {
  failure: Error | null = null;

  constructor(private readonly steps: string[]) {
    super();
  }

  async removeDocument(documentId: string): Promise<void> {
    if (this.failure) {
      throw this.failure;
    }
    this.steps.push(`graph:${documentId}`);
  }
}

function createService() {
  const steps: string[] = [];
  const graph = new RecordingGraph(steps);
  const files = new InMemoryFileStore();
  const documents = new FakeDocumentStatusRepository();
  const refresher = {
    refresh: async () => {
      steps.push('refresh');
    },
  } as unknown as KnowledgeRefresher;
  return {
    steps,
    graph,
    files,
    documents,
    service: new RemovalService(graph, refresher, files, documents),
  };
}

describe('RemovalService', () => {
  it('removes the graph data, refreshes, then deletes the file and the row', async () => {
    const { service, steps, files, documents } = createService();
    await files.save('doc', Buffer.from('x'));
    documents.add({ id: 'doc', status: 'deleting' });

    await service.handleJob('doc');

    expect(steps).toEqual(['graph:doc', 'refresh']);
    expect(files.files.has('doc')).toBe(false);
    expect(documents.rows.has('doc')).toBe(false);
  });

  it('is safe to repeat', async () => {
    const { service, documents } = createService();
    documents.add({ id: 'doc', status: 'deleting' });

    await service.handleJob('doc');

    await expect(service.handleJob('doc')).resolves.toBeUndefined();
  });

  it('marks the document failed and keeps its row and file on an error', async () => {
    const { service, graph, files, documents } = createService();
    await files.save('doc', Buffer.from('x'));
    documents.add({ id: 'doc', status: 'deleting' });
    graph.failure = new Error('graph down');

    await service.handleJob('doc');

    expect(documents.rows.get('doc')).toMatchObject({ status: 'failed', error: 'graph down' });
    expect(files.files.has('doc')).toBe(true);
  });
});
