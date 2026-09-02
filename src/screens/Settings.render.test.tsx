// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme';
import { Settings } from './Settings';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderSettings() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Settings', () => {
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
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('renders the settings page', () => {
    renderSettings();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Mailboxes')).toBeTruthy();
  });

  it('contains the 10,080 minutes copy in Mailboxes section', async () => {
    renderSettings();
    const mailboxesButton = screen.getByText('Mailboxes');
    mailboxesButton.click();
    await waitFor(() => {
      expect(screen.getByText(/10,080 minutes/)).toBeTruthy();
    });
  });

  it('does not contain "every 3 days" in Mailboxes section', async () => {
    renderSettings();
    const mailboxesButton = screen.getByText('Mailboxes');
    mailboxesButton.click();
    await waitFor(() => {
      expect(screen.getByText(/10,080 minutes/)).toBeTruthy();
    });
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('every 3 days');
  });

  it('mentions GET /api/health/ingest endpoint in Mailboxes section', async () => {
    renderSettings();
    const mailboxesButton = screen.getByText('Mailboxes');
    mailboxesButton.click();
    await waitFor(() => {
      expect(screen.getByText('GET /api/health/ingest')).toBeTruthy();
    });
  });

  it('mentions POST /api/health/renewal-drill endpoint in Mailboxes section', async () => {
    renderSettings();
    const mailboxesButton = screen.getByText('Mailboxes');
    mailboxesButton.click();
    await waitFor(() => {
      expect(screen.getByText('POST /api/health/renewal-drill')).toBeTruthy();
    });
  });
});

describe('Settings in live mode with unhealthy mailbox', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'http://anchor.test');
    vi.stubEnv('VITE_API_TOKEN', 'test-token');
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
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('shows ingest health error when mailbox is unhealthy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/health/ingest')) {
          return jsonResponse(
            {
              ok: false,
              mailboxes: [
                {
                  brand: 'CD',
                  address: 'care@carolsdaughter.com',
                  healthy: false,
                  problems: ['subscription-expired'],
                  lastSyncAt: null,
                  expiresInMinutes: null,
                },
              ],
            },
            503,
          );
        }
        return jsonResponse({});
      }),
    );

    vi.resetModules();
    const { Settings: SettingsFresh } = await import('./Settings');
    const { ThemeProvider: ThemeProviderFresh } = await import('@/lib/theme');
    render(
      <ThemeProviderFresh>
        <MemoryRouter>
          <SettingsFresh />
        </MemoryRouter>
      </ThemeProviderFresh>,
    );

    const mailboxesButton = await screen.findByText('Mailboxes');
    mailboxesButton.click();

    await waitFor(() => {
      expect(screen.getByText('Mailbox ingest is unhealthy')).toBeTruthy();
    });
    const expiredBadges = screen.getAllByText('Expired');
    expect(expiredBadges.length).toBeGreaterThan(0);
  });
});
