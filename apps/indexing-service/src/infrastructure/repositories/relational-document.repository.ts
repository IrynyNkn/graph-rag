import type { Document } from '@graph-rag/contracts';
import { and, desc, documents, eq, gt, or, RelationalStore } from '@graph-rag/relational-store';
import { Injectable } from '@nestjs/common';
import { DocumentRepository, type NewDocument } from '../../application/document.repository.js';

type DocumentRow = typeof documents.$inferSelect;

@Injectable()
export class RelationalDocumentRepository extends DocumentRepository {
  constructor(private readonly store: RelationalStore) {
    super();
  }

  async findAll(): Promise<Document[]> {
    const rows = await this.store.db.select().from(documents).orderBy(desc(documents.createdAt));
    return rows.map(toDocument);
  }

  async findById(id: string): Promise<Document | null> {
    const rows = await this.store.db.select().from(documents).where(eq(documents.id, id));
    return firstDocument(rows);
  }

  async insert(document: NewDocument): Promise<Document | null> {
    const rows = await this.store.db
      .insert(documents)
      .values({ ...document, status: 'queued' })
      .onConflictDoNothing({ target: documents.contentHash })
      .returning();
    return firstDocument(rows);
  }

  async delete(id: string): Promise<void> {
    await this.store.db.delete(documents).where(eq(documents.id, id));
  }

  async markDeleting(id: string): Promise<Document | null> {
    const rows = await this.store.db
      .update(documents)
      .set({ status: 'deleting', error: null, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return firstDocument(rows);
  }

  async requeue(id: string): Promise<Document | null> {
    const rows = await this.store.db
      .update(documents)
      .set({ status: 'queued', error: null, updatedAt: new Date() })
      .where(
        and(
          eq(documents.id, id),
          or(
            eq(documents.status, 'failed'),
            and(eq(documents.status, 'indexed'), gt(documents.chunksFailed, 0)),
          ),
        ),
      )
      .returning();
    return firstDocument(rows);
  }

  async markFailed(id: string, error: string): Promise<Document | null> {
    const rows = await this.store.db
      .update(documents)
      .set({ status: 'failed', error, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return firstDocument(rows);
  }
}

function firstDocument(rows: DocumentRow[]): Document | null {
  const [row] = rows;
  return row === undefined ? null : toDocument(row);
}

function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    sizeBytes: row.sizeBytes,
    status: row.status,
    chunksTotal: row.chunksTotal,
    chunksDone: row.chunksDone,
    chunksFailed: row.chunksFailed,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
