import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';
import { applyStoredTheme, useTheme } from './use-theme';

function mockSystemTheme(theme: 'light' | 'dark') {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query.includes(theme) })),
  );
}

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    mockSystemTheme('dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows the system until a theme is picked', () => {
    mockSystemTheme('light');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('remembers a picked theme and applies it', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe('light');
    expect(window.localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('prefers a picked theme over the system', () => {
    window.localStorage.setItem('theme', 'light');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
  });

  it('crossfades where the browser can', () => {
    const startViewTransition = vi.fn((change: () => void) => change());
    Object.assign(document, { startViewTransition });
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());

    expect(startViewTransition).toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe('light');
    Object.assign(document, { startViewTransition: undefined });
  });

  it('applies a remembered theme on startup, and otherwise leaves it to the system', () => {
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBeUndefined();

    window.localStorage.setItem('theme', 'dark');
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

describe('TopBar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockSystemTheme('dark');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]')),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderBar() {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/documents']}>
          <TopBar />
          <CurrentPath />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('links to both sections and marks the current one', () => {
    renderBar();

    expect(screen.getByRole('link', { name: 'Chat' }).classList).not.toContain('active');
    expect(screen.getByRole('link', { name: 'Documents' }).classList).toContain('active');
  });

  it('starts a new chat', () => {
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    expect(screen.getByTestId('path').textContent).toBe('/chat');
  });

  it('switches the theme', () => {
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Use the light theme' }));

    expect(screen.getByRole('button', { name: 'Use the dark theme' })).toBeTruthy();
  });
});
