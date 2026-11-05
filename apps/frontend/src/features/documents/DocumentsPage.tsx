import type { ChangeEvent } from 'react';
import { DocumentTable } from './DocumentTable';
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
      <header className="documents-header">
        <h1>Documents</h1>
        <label className="documents-upload">
          {isUploading ? 'Uploading...' : 'Upload'}
          <input type="file" multiple hidden accept={ACCEPTED_FILES} onChange={handleFiles} />
        </label>
      </header>
      {error !== null && <p className="documents-error">{error}</p>}
      {!isLoading && <DocumentTable documents={documents} onRemove={remove} onRetry={retry} />}
      {isDragging && (
        <div className="documents-drop" aria-hidden="true">
          Drop it
        </div>
      )}
    </section>
  );
}
