import type { Document, DocumentStatus } from '@graph-rag/contracts';

const IN_PROGRESS: ReadonlySet<DocumentStatus> = new Set(['queued', 'indexing', 'deleting']);
const KILOBYTE = 1024;

export function isInProgress(document: Document): boolean {
  return IN_PROGRESS.has(document.status);
}

export function canRetry(document: Document): boolean {
  return (
    document.status === 'failed' || (document.status === 'indexed' && hasFailedChunks(document))
  );
}

export function canDelete(document: Document): boolean {
  return document.status !== 'deleting';
}

export function describeProgress(document: Document): string {
  if (document.chunksTotal === 0) {
    return '';
  }
  const done = `${document.chunksDone}/${document.chunksTotal} chunks`;
  return hasFailedChunks(document) ? `${done}, ${document.chunksFailed} failed` : done;
}

export function findProgressShares(document: Document): { done: number; failed: number } {
  const { chunksTotal, chunksDone, chunksFailed } = document;
  return chunksTotal === 0
    ? { done: 0, failed: 0 }
    : { done: chunksDone / chunksTotal, failed: chunksFailed / chunksTotal };
}

export function summarizeDocuments(documents: Document[]): string {
  const total = `${documents.length} ${documents.length === 1 ? 'document' : 'documents'}`;
  const byStatus = (['indexed', 'indexing', 'queued', 'failed'] as const)
    .map((status) => [status, documents.filter((item) => item.status === status).length] as const)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`);
  return [total, ...byStatus].join(' · ');
}

export function formatSize(bytes: number): string {
  if (bytes < KILOBYTE) {
    return `${bytes} B`;
  }
  if (bytes < KILOBYTE * KILOBYTE) {
    return `${Math.round(bytes / KILOBYTE)} KB`;
  }
  return `${(bytes / (KILOBYTE * KILOBYTE)).toFixed(1)} MB`;
}

function hasFailedChunks(document: Document): boolean {
  return document.chunksFailed > 0;
}
