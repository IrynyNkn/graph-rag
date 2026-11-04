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
