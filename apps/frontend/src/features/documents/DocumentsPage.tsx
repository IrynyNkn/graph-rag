import type { ChangeEvent } from 'react';
import { DocumentTable } from './DocumentTable';
import { useDocuments } from './use-documents';

const ACCEPTED_FILES = '.pdf,.txt,.md,.markdown';

export function DocumentsPage() {
  const { documents, isLoading, isUploading, error, upload, remove, retry } = useDocuments();

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    if (files.length > 0) {
      upload(files);
    }
    event.target.value = '';
  };

  return (
    <section className="documents">
      <header className="documents-header">
        <h1>Documents</h1>
        <label className="button button-primary">
          {isUploading ? 'Uploading...' : 'Upload'}
          <input type="file" multiple hidden accept={ACCEPTED_FILES} onChange={handleFiles} />
        </label>
      </header>
      {error !== null && <p className="error">{error}</p>}
      {isLoading ? (
        <p className="muted">Loading...</p>
      ) : (
        <DocumentTable documents={documents} onRemove={remove} onRetry={retry} />
      )}
    </section>
  );
}
