import { documentSchema, type Document } from '@graph-rag/contracts';
import { requestJson } from './http';

const BASE_URL = '/api/indexing/documents';

export function listDocuments(): Promise<Document[]> {
  return requestJson(BASE_URL, documentSchema.array());
}

export function uploadDocument(file: File): Promise<Document> {
  const body = new FormData();
  body.append('file', file);
  return requestJson(BASE_URL, documentSchema, { method: 'POST', body });
}

export function removeDocument(id: string): Promise<Document> {
  return requestJson(`${BASE_URL}/${id}`, documentSchema, { method: 'DELETE' });
}

export function retryDocument(id: string): Promise<Document> {
  return requestJson(`${BASE_URL}/${id}/retry`, documentSchema, { method: 'POST' });
}
