import type { Document } from '@graph-rag/contracts';
import { canDelete, canRetry, describeProgress, formatSize } from './document-view';

interface DocumentTableProps {
  documents: Document[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

export function DocumentTable({ documents, onRemove, onRetry }: DocumentTableProps) {
  if (documents.length === 0) {
    return <p className="muted">No documents yet. Upload a PDF, TXT or MD file.</p>;
  }
  return (
    <table className="documents-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Size</th>
          <th>Status</th>
          <th>Progress</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {documents.map((document) => (
          <tr key={document.id}>
            <td>
              {document.name}
              {document.error !== null && <div className="error">{document.error}</div>}
            </td>
            <td>{formatSize(document.sizeBytes)}</td>
            <td>
              <span className={`status status-${document.status}`}>{document.status}</span>
            </td>
            <td>{describeProgress(document)}</td>
            <td>
              <div className="documents-actions">
                {canRetry(document) && (
                  <button type="button" className="button" onClick={() => onRetry(document.id)}>
                    Retry
                  </button>
                )}
                {canDelete(document) && (
                  <button type="button" className="button" onClick={() => onRemove(document.id)}>
                    Delete
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
