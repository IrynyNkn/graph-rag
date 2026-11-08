import type { Conversation } from '@graph-rag/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationSwitcher } from './ConversationSwitcher';

const ID = '6a3f3f62-0a4c-4f7e-9a53-000000000001';
const OTHER_ID = '6a3f3f62-0a4c-4f7e-9a53-000000000002';
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

const conversations: Conversation[] = [
  { id: ID, title: 'Who manages?', createdAt: TIMESTAMP, updatedAt: TIMESTAMP },
  { id: OTHER_ID, title: null, createdAt: TIMESTAMP, updatedAt: TIMESTAMP },
];

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

describe('ConversationSwitcher', () => {
  function renderSwitcher(path: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <ConversationSwitcher />
          <CurrentPath />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  const path = () => screen.getByTestId('path').textContent;
  const search = () => screen.getByRole('textbox', { name: 'Find a conversation' });

  async function openPalette(start: string) {
    renderSwitcher(start);
    fireEvent.click(await screen.findByRole('button', { name: /Who manages\?|Conversations/ }));
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify(conversations)),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the open conversation, and opens the palette', async () => {
    await openPalette(`/chat/${ID}`);

    expect(screen.getByRole('dialog', { name: 'Conversations' })).toBeTruthy();
    expect(screen.getAllByText('Who manages?')).toHaveLength(2);
    expect(screen.getAllByText('New chat')).toHaveLength(2);
  });

  it('opens and closes with the keyboard shortcut', async () => {
    renderSwitcher('/chat');
    await screen.findByText('Conversations');

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'K', metaKey: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opens a conversation with a click', async () => {
    await openPalette('/chat');

    fireEvent.click(screen.getByRole('button', { name: /^Who manages\?/ }));

    expect(path()).toBe(`/chat/${ID}`);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('moves with the arrows, wraps around, and opens with Enter', async () => {
    await openPalette(`/chat/${ID}`);

    fireEvent.keyDown(search(), { key: 'ArrowUp' });
    fireEvent.keyDown(search(), { key: 'Enter' });

    expect(path()).toBe(`/chat/${OTHER_ID}`);
  });

  it('offers a new chat first', async () => {
    await openPalette(`/chat/${ID}`);

    fireEvent.keyDown(search(), { key: 'Enter' });

    expect(path()).toBe('/chat');
  });

  it('narrows the list as the user types, without the new chat', async () => {
    await openPalette('/chat');

    fireEvent.change(search(), { target: { value: 'manages' } });
    fireEvent.keyDown(search(), { key: 'Enter' });

    expect(path()).toBe(`/chat/${ID}`);
  });

  it('says when nothing matches', async () => {
    await openPalette('/chat');

    fireEvent.change(search(), { target: { value: 'nothing like this' } });

    expect(screen.getByText('Nothing matches.')).toBeTruthy();
  });

  it('closes on Escape and on a click outside', async () => {
    await openPalette('/chat');
    fireEvent.keyDown(search(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Conversations/ }));
    fireEvent.pointerDown(document.querySelector('.palette-backdrop') as Element);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('highlights the row under the pointer', async () => {
    await openPalette('/chat');
    const row = screen.getByRole('button', { name: /^Who manages\?/ }).closest('li') as Element;

    fireEvent.pointerMove(row);

    expect(row.classList).toContain('is-highlighted');
  });

  it('asks before deleting, and leaves a conversation that gets deleted', async () => {
    await openPalette(`/chat/${ID}`);

    fireEvent.click(screen.getByLabelText('Delete Who manages?'));
    expect(fetch).not.toHaveBeenCalledWith(
      `/api/assistant/conversations/${ID}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    fireEvent.click(screen.getByText('Sure?'));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/assistant/conversations/${ID}`,
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(path()).toBe('/chat');
  });

  it('stays in the open conversation when another one is deleted', async () => {
    await openPalette(`/chat/${ID}`);

    fireEvent.click(screen.getByLabelText('Delete chat'));
    fireEvent.click(screen.getByText('Sure?'));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/assistant/conversations/${OTHER_ID}`,
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(path()).toBe(`/chat/${ID}`);
  });
});
