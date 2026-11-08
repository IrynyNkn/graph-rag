import { AnimatePresence, motion } from 'motion/react';
import type { ChangeEvent } from 'react';
import { UploadIcon } from '../../app/icons';
import { SNAPPY } from '../../app/motion';
import { summarizeDocuments } from './document-view';
import { DocumentList } from './DocumentList';
import { useDocuments } from './use-documents';
import { useFileDrop } from './use-file-drop';
import './documents.css';

const ACCEPTED_FILES = '.pdf,.txt,.md,.markdown';

export function DocumentsPage() {
  const { documents, isLoading, isUploading, error, upload, remove, retry } = useDocuments();
  const { isDragging, dropTarget } = useFileDrop(upload);

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    if (files.length > 0) {
      upload(files);
    }
    event.target.value = '';
  };

  return (
    <section className="documents" {...dropTarget}>
      <div className="documents-inner">
        <header className="documents-header">
          <div>
            <h1>Documents</h1>
            <p>{isLoading ? ' ' : summarizeDocuments(documents)}</p>
          </div>
          <label className="documents-upload">
            <UploadIcon />
            {isUploading ? 'Uploading' : 'Upload'}
            <input type="file" multiple hidden accept={ACCEPTED_FILES} onChange={handleFiles} />
          </label>
        </header>
        {error !== null && <p className="documents-error">{error}</p>}
        {!isLoading && <DocumentList documents={documents} onRemove={remove} onRetry={retry} />}
      </div>
      <AnimatePresence>
        {isDragging && (
          <motion.div
            className="documents-drop"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
          >
            <motion.div
              className="documents-drop-frame"
              initial={{ scale: 0.98 }}
              animate={{ scale: 1 }}
              transition={SNAPPY}
            >
              <UploadIcon />
              Drop to upload
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
