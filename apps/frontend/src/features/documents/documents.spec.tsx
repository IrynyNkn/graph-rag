import type { Document } from '@graph-rag/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canDelete, canRetry, describeProgress, formatSize, isInProgress } from './document-view';
import { DocumentsPage } from './DocumentsPage';

const ID = '6a3f3f62-0a4c-4f7e-9a53-000000000001';

const document = (overrides: Partial<Document> = {}): Document => ({
  id: ID,
  name: 'report.pdf',
  type: 'pdf',
  sizeBytes: 2048,
  status: 'indexed',
  chunksTotal: 4,
  chunksDone: 4,
  chunksFailed: 0,
  error: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('document view helpers', () => {
  it('knows which statuses are in progress', () => {
    expect(isInProgress(document({ status: 'indexing' }))).toBe(true);
    expect(isInProgress(document({ status: 'queued' }))).toBe(true);
    expect(isInProgress(document({ status: 'deleting' }))).toBe(true);
    expect(isInProgress(document({ status: 'indexed' }))).toBe(false);
    expect(isInProgress(document({ status: 'failed' }))).toBe(false);
  });

  it('offers a retry for failures and for failed chunks', () => {
    expect(canRetry(document({ status: 'failed' }))).toBe(true);
    expect(canRetry(document({ chunksFailed: 1 }))).toBe(true);
    expect(canRetry(document())).toBe(false);
    expect(canRetry(document({ status: 'indexing', chunksFailed: 1 }))).toBe(false);
  });

  it('offers a delete unless one is running', () => {
    expect(canDelete(document())).toBe(true);
    expect(canDelete(document({ status: 'deleting' }))).toBe(false);
  });

  it('describes progress', () => {
    expect(describeProgress(document({ chunksTotal: 0 }))).toBe('');
    expect(describeProgress(document({ chunksDone: 2 }))).toBe('2/4 chunks');
    expect(describeProgress(document({ chunksDone: 2, chunksFailed: 1 }))).toBe(
      '2/4 chunks, 1 failed',
    );
  });

  it('formats sizes', () => {
    expect(formatSize(10)).toBe('10 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('DocumentsPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let listed: Document[];

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
  }

  function renderPage(): void {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    render(<DocumentsPage />, { wrapper });
  }

  beforeEach(() => {
    listed = [];
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method ? json(document()) : json(listed),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('invites an upload when there are no documents', async () => {
    renderPage();

    expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();
  });

  it('shows a document with its status, progress and error', async () => {
    listed = [document({ status: 'failed', error: 'No text layer', chunksDone: 1 })];

    renderPage();

    expect(await screen.findByText('report.pdf')).toBeTruthy();
    expect(screen.getByText('failed')).toBeTruthy();
    expect(screen.getByText('No text layer')).toBeTruthy();
    expect(screen.getByText('1/4 chunks')).toBeTruthy();
  });

  it('deletes and retries through the API', async () => {
    listed = [document({ status: 'failed' })];
    renderPage();

    fireEvent.click(await screen.findByText('Retry'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/indexing/documents/${ID}/retry`,
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    fireEvent.click(screen.getByText('Delete'));
    expect(fetchMock).not.toHaveBeenCalledWith(
      `/api/indexing/documents/${ID}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    fireEvent.click(screen.getByText('Sure?'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/indexing/documents/${ID}`,
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('uploads the chosen files', async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <DocumentsPage />
      </QueryClientProvider>,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['text'], 'notes.txt');

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/indexing/documents',
        expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
      ),
    );
  });

  it('forgets about a delete when the pointer leaves the button', async () => {
    listed = [document()];
    renderPage();

    fireEvent.click(await screen.findByText('Delete'));
    fireEvent.mouseLeave(screen.getByText('Sure?'));

    expect(screen.getByText('Delete')).toBeTruthy();
    expect(screen.queryByText('Sure?')).toBeNull();
  });

  it('shows chunks as stops, filled in as they get done', async () => {
    listed = [document({ status: 'indexing', chunksTotal: 4, chunksDone: 2, chunksFailed: 1 })];

    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <DocumentsPage />
      </QueryClientProvider>,
    );

    await screen.findByText('report.pdf');
    expect(container.querySelectorAll('.chunk-done')).toHaveLength(2);
    expect(container.querySelectorAll('.chunk-failed')).toHaveLength(1);
    expect(container.querySelectorAll('.chunk-pending')).toHaveLength(1);
    client.clear();
  });

  it('draws at most so many stops for a long document', async () => {
    listed = [document({ chunksTotal: 400, chunksDone: 200 })];

    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <DocumentsPage />
      </QueryClientProvider>,
    );

    await screen.findByText('report.pdf');
    expect(container.querySelectorAll('.chunk')).toHaveLength(32);
  });

  it('uploads files dropped anywhere on the page, and shows when it can', async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <DocumentsPage />
      </QueryClientProvider>,
    );
    const page = container.querySelector('.documents') as HTMLElement;
    const dataTransfer = { files: [new File(['text'], 'dropped.txt')] };

    fireEvent.dragEnter(page, { dataTransfer });
    expect(screen.getByText('Drop it')).toBeTruthy();

    fireEvent.drop(page, { dataTransfer });
    expect(screen.queryByText('Drop it')).toBeNull();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/indexing/documents',
        expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
      ),
    );
  });

  it('stops showing the drop target when the drag leaves the page', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <DocumentsPage />
      </QueryClientProvider>,
    );
    const page = container.querySelector('.documents') as HTMLElement;

    fireEvent.dragEnter(page);
    fireEvent.dragEnter(page);
    fireEvent.dragLeave(page);
    expect(screen.getByText('Drop it')).toBeTruthy();

    fireEvent.dragLeave(page);
    expect(screen.queryByText('Drop it')).toBeNull();
  });

  it('shows why an upload was rejected', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method ? json({ message: 'Already uploaded' }, 409) : json([]),
    );
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <DocumentsPage />
      </QueryClientProvider>,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(['text'], 'notes.txt')] } });

    expect(await screen.findByText('Already uploaded')).toBeTruthy();
  });
});
