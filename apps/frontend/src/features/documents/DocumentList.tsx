import type { Document } from '@graph-rag/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { ConfirmButton } from '../../app/ConfirmButton';
import { SMOOTH, SNAPPY } from '../../app/motion';
import {
  canDelete,
  canRetry,
  describeProgress,
  findProgressShares,
  formatSize,
  isInProgress,
} from './document-view';

interface DocumentListProps {
  documents: Document[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

export function DocumentList({ documents, onRemove, onRetry }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="documents-empty">
        <p>Nothing here yet.</p>
        <p>Drop a PDF, TXT or Markdown file anywhere on this page.</p>
      </div>
    );
  }
  return (
    <ul className="document-list">
      <AnimatePresence initial={false}>
        {documents.map((document) => (
          <DocumentRow
            key={document.id}
            document={document}
            onRemove={onRemove}
            onRetry={onRetry}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

interface DocumentRowProps {
  document: Document;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

function DocumentRow({ document, onRemove, onRetry }: DocumentRowProps) {
  return (
    <motion.li
      layout="position"
      className={`document document-${document.status}`}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={SNAPPY}
    >
      <div className="document-row">
        <span className="document-type" aria-hidden="true">
          {document.type}
        </span>
        <div className="document-main">
          <span className="document-name">{document.name}</span>
          {document.error !== null && <span className="document-error">{document.error}</span>}
        </div>
        <span className="document-size">{formatSize(document.sizeBytes)}</span>
        <ChunkProgress document={document} />
        <span className="document-status">
          <i aria-hidden="true" />
          {document.status}
        </span>
        <div className="document-actions">
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
        </div>
      </div>
    </motion.li>
  );
}

function ChunkProgress({ document }: { document: Document }) {
  const { done, failed } = findProgressShares(document);
  return (
    <div className="document-progress">
      <span className="document-chunks">{describeProgress(document)}</span>
      {isInProgress(document) && document.chunksTotal > 0 && (
        <span className="progress-bar" aria-hidden="true">
          <motion.i
            className="progress-done"
            initial={false}
            animate={{ width: `${done * 100}%` }}
            transition={SMOOTH}
          />
          <motion.i
            className="progress-failed"
            initial={false}
            animate={{ width: `${failed * 100}%` }}
            transition={SMOOTH}
          />
        </span>
      )}
    </div>
  );
}
