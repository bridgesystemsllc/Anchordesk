// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme';
import { LoginView } from './Login';

function renderLogin(status: 'ready' | 'loading' | 'error' = 'ready') {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <LoginView status={status} />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('LoginView', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('light') ? false : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders ready state with sign-in button', () => {
    renderLogin('ready');
    expect(screen.getByText('Sign in with Microsoft')).toBeTruthy();
    expect(screen.getByText(/Five brand mailboxes/)).toBeTruthy();
  });

  it('renders loading state', () => {
    renderLogin('loading');
    expect(screen.getByText('Signing in...')).toBeTruthy();
  });

  it('renders error state with correct headline', () => {
    renderLogin('error');
    expect(screen.getByText('Microsoft sign-in did not complete')).toBeTruthy();
    expect(screen.getByText(/Entra SSO is not wired on this ticket/)).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });
});
