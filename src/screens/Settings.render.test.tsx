// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const API = 'http://anchor.test';

vi.mock('@/lib/theme', () => ({
  useTheme: () => ({
    pref: 'dark' as const,
    resolved: 'dark' as const,
    setPref: vi.fn(),
    cycle: vi.fn(),
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function renderSettings() {
  const { Settings } = await import('@/screens/Settings');
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe('Settings screen (AD-106)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', '');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('Navigation', () => {
    it('renders all nine navigation items', async () => {
      await renderSettings();

      expect(screen.getByText('Appearance')).toBeTruthy();
      expect(screen.getByText('Mailboxes')).toBeTruthy();
      expect(screen.getByText('Brands & voice')).toBeTruthy();
      expect(screen.getByText('Excel bindings')).toBeTruthy();
      expect(screen.getByText('Escalation routing')).toBeTruthy();
      expect(screen.getByText('Knowledge sources')).toBeTruthy();
      expect(screen.getByText('Users & roles')).toBeTruthy();
      expect(screen.getByText('SLA targets')).toBeTruthy();
      expect(screen.getByText('AI settings')).toBeTruthy();
    });

    it('starts on Appearance section', async () => {
      await renderSettings();
      expect(screen.getByText('Colour theme')).toBeTruthy();
    });

    it('switches sections on click', async () => {
      await renderSettings();
      fireEvent.click(screen.getByText('SLA targets'));
      await waitFor(() => expect(screen.getByText('First-reply targets')).toBeTruthy());
    });
  });

  describe('Demo mode behavior', () => {
    it('shows demo hint in Mailboxes section', async () => {
      await renderSettings();
      fireEvent.click(screen.getByText('Mailboxes'));
      await waitFor(() => expect(screen.getByText(/Demo mode/)).toBeTruthy());
    });

    it('shows demo hint in Brands section', async () => {
      await renderSettings();
      fireEvent.click(screen.getByText('Brands & voice'));
      await waitFor(() => expect(screen.getByText(/Demo mode/)).toBeTruthy());
    });

    it('shows demo hint in Routing section', async () => {
      await renderSettings();
      fireEvent.click(screen.getByText('Escalation routing'));
      await waitFor(() => expect(screen.getByText(/Demo mode/)).toBeTruthy());
    });

    it('shows empty state for routing when no rules in demo mode', async () => {
      await renderSettings();
      fireEvent.click(screen.getByText('Escalation routing'));
      await waitFor(() => expect(screen.getByText('No routing rules yet.')).toBeTruthy());
    });
  });

  describe('Appearance section', () => {
    it('renders theme options', async () => {
      await renderSettings();
      expect(screen.getByText('Dark')).toBeTruthy();
      expect(screen.getByText('Light')).toBeTruthy();
      expect(screen.getByText('System')).toBeTruthy();
    });

    it('renders preview badges', async () => {
      await renderSettings();
      expect(screen.getByText('Primary')).toBeTruthy();
      expect(screen.getByText('Secondary')).toBeTruthy();
    });
  });

  describe('SLA section structure', () => {
    it('displays all four priority levels in demo mode', async () => {
      await renderSettings();
      fireEvent.click(screen.getByText('SLA targets'));
      await waitFor(() => {
        expect(screen.getByText('P1 — Critical')).toBeTruthy();
        expect(screen.getByText('P2 — High')).toBeTruthy();
        expect(screen.getByText('P3 — Normal')).toBeTruthy();
        expect(screen.getByText('P4 — Low')).toBeTruthy();
      });
    });
  });

  describe('AI Settings section', () => {
    it('displays drafting controls', async () => {
      await renderSettings();
      fireEvent.click(screen.getByText('AI settings'));
      await waitFor(() => {
        expect(screen.getByText('Draft on arrival')).toBeTruthy();
        expect(screen.getByText(/Require a citation/)).toBeTruthy();
        expect(screen.getByText('Model')).toBeTruthy();
        expect(screen.getByText('Tone')).toBeTruthy();
      });
    });

    it('displays guardrails', async () => {
      await renderSettings();
      fireEvent.click(screen.getByText('AI settings'));
      await waitFor(() => {
        expect(screen.getByText(/Never deflect a supervisor request/)).toBeTruthy();
        expect(screen.getByText(/Never send unattended/)).toBeTruthy();
      });
    });
  });

  describe('Knowledge section', () => {
    it('displays SharePoint connection panel', async () => {
      await renderSettings();
      fireEvent.click(screen.getByText('Knowledge sources'));
      await waitFor(() => {
        expect(screen.getByText('SharePoint connection')).toBeTruthy();
        expect(screen.getByText('Site ID')).toBeTruthy();
        expect(screen.getByText('Drive ID')).toBeTruthy();
      });
    });

    it('displays retrieval quality callout', async () => {
      await renderSettings();
      fireEvent.click(screen.getByText('Knowledge sources'));
      await waitFor(() => {
        expect(screen.getByText(/Retrieval quality is the lever/)).toBeTruthy();
      });
    });
  });

  describe('Page header', () => {
    it('displays correct title and description', async () => {
      await renderSettings();
      expect(screen.getByText('Settings')).toBeTruthy();
      expect(screen.getByText(/Anything that will change is data, not code/)).toBeTruthy();
    });
  });
});

describe('Settings in live mode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', API);
    vi.stubEnv('VITE_API_TOKEN', 'test-token');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('fetches mailboxes from the API', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/settings/mailboxes')) {
        return jsonResponse({
          mailboxes: [
            {
              id: '1',
              brandCode: 'CD',
              address: 'care@carolsdaughter.com',
              graphUserId: 'user1',
              displayName: "Carol's Daughter",
              enabled: true,
              subscriptionExpiresAt: null,
              lastSyncAt: new Date().toISOString(),
            },
          ],
        });
      }
      return jsonResponse({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderSettings();
    fireEvent.click(screen.getByText('Mailboxes'));

    await waitFor(() => {
      expect(screen.getByText("Carol's Daughter")).toBeTruthy();
      expect(screen.getByText('care@carolsdaughter.com')).toBeTruthy();
    });
  });

  it('fetches brands from the API', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/settings/brands')) {
        return jsonResponse({
          brands: [
            {
              brandCode: 'CD',
              displayName: "Carol's Daughter",
              shortName: "Carol's D.",
              signature: 'The Care Team',
              voice: 'Warm and friendly',
            },
          ],
        });
      }
      return jsonResponse({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderSettings();
    fireEvent.click(screen.getByText('Brands & voice'));

    await waitFor(() => {
      expect(screen.getByText("Carol's Daughter")).toBeTruthy();
      expect(screen.getByText('Warm and friendly')).toBeTruthy();
    });
  });

  it('fetches SLA targets from the API', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/settings/sla')) {
        return jsonResponse({
          sla: [
            { priority: 1, firstResponseMinutes: 60, appliesTo: 'VIP' },
            { priority: 2, firstResponseMinutes: 120, appliesTo: 'High' },
            { priority: 3, firstResponseMinutes: 240, appliesTo: 'Normal' },
            { priority: 4, firstResponseMinutes: 1440, appliesTo: 'Low' },
          ],
        });
      }
      return jsonResponse({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderSettings();
    fireEvent.click(screen.getByText('SLA targets'));

    await waitFor(() => {
      expect(screen.getByText('P1 — Critical')).toBeTruthy();
      expect(screen.getByText('1 hour')).toBeTruthy();
    });
  });

  it('fetches AI settings from the API', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/settings/ai')) {
        return jsonResponse({
          ai: {
            id: 'default',
            model: 'claude-sonnet-4-5',
            tone: 'warm',
            costCeilingUsd: '50',
            autoDraft: true,
            requireCitations: true,
          },
        });
      }
      return jsonResponse({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderSettings();
    fireEvent.click(screen.getByText('AI settings'));

    await waitFor(() => {
      expect(screen.getByText('Draft on arrival')).toBeTruthy();
    });
  });

  it('sends the bearer token on API calls', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ mailboxes: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await renderSettings();
    fireEvent.click(screen.getByText('Mailboxes'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer test-token');
  });
});
