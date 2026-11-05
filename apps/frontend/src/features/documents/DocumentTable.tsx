import type { Document } from '@graph-rag/contracts';
import type { CSSProperties } from 'react';
import { ConfirmButton } from '../../app/ConfirmButton';
import { Halftone } from '../../app/Halftone';
import { canDelete, canRetry, describeProgress, formatSize } from './document-view';

const MAX_DRAWN_CHUNKS = 32;
// A stamp is never quite straight, and the same document keeps its angle between polls.
const STAMP_TILTS = [-3, 2, -1.5, 3, -2.5, 1];

interface DocumentTableProps {
  documents: Document[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

export function DocumentTable({ documents, onRemove, onRetry }: DocumentTableProps) {
  if (documents.length === 0) {
    return (
      <div className="documents-empty">
        <Halftone diameter={220} />
        <p>Nothing here yet. Drop a PDF, TXT or MD file anywhere on this page.</p>
      </div>
    );
  }
  return (
    <table className="documents-table">
      <thead>
        <tr>
          <th>Document</th>
          <th>Size</th>
          <th>Status</th>
          <th>Chunks</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {documents.map((document) => (
          <tr key={document.id}>
            <td>
              <span className="documents-name">{document.name}</span>
              {document.error !== null && <div className="documents-error">{document.error}</div>}
            </td>
            <td>{formatSize(document.sizeBytes)}</td>
            <td>
              <span
                className={`stamp stamp-${document.status}`}
                style={{ '--tilt': `${tiltOf(document.id)}deg` } as CSSProperties}
              >
                {document.status}
              </span>
            </td>
            <td>
              <ChunkProgress document={document} />
            </td>
            <td className="documents-actions">
              {canRetry(document) && (
                <button type="button" onClick={() => onRetry(document.id)}>
                  Retry
                </button>
              )}
              {canDelete(document) && (
                <ConfirmButton
                  label={`Delete ${document.name}`}
                  onConfirm={() => onRemove(document.id)}
                >
                  Delete
                </ConfirmButton>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function tiltOf(id: string): number {
  const hash = [...id].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0);
  return STAMP_TILTS[hash % STAMP_TILTS.length] ?? 0;
}

/** Chunks are stops on a line, filled in as they get done. */
function ChunkProgress({ document }: { document: Document }) {
  const { chunksTotal, chunksDone, chunksFailed } = document;
  if (chunksTotal === 0) {
    return null;
  }
  const drawn = Math.min(chunksTotal, MAX_DRAWN_CHUNKS);
  const done = Math.round((chunksDone / chunksTotal) * drawn);
  const failed = Math.round((chunksFailed / chunksTotal) * drawn);
  return (
    <>
      <span className="chunk-line" aria-hidden="true">
        {Array.from({ length: drawn }, (_, index) => {
          const state = index < done ? 'done' : index < done + failed ? 'failed' : 'pending';
          return <i key={index} className={`chunk chunk-${state}`} />;
        })}
      </span>
      <span className="chunk-text">{describeProgress(document)}</span>
    </>
  );
}
