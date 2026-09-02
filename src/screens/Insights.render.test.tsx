// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InsightsView } from './Insights';

function renderInsights(status: 'ready' | 'loading' | 'empty' | 'error' = 'ready') {
  return render(
    <MemoryRouter>
      <InsightsView status={status} onRetry={() => {}} />
    </MemoryRouter>,
  );
}

describe('InsightsView', () => {
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

  it('renders ready state with KPIs', () => {
    renderInsights('ready');
    expect(screen.getByText('Insights')).toBeTruthy();
    expect(screen.getByText(/Rolling 7 days/)).toBeTruthy();
  });

  it('renders loading state', () => {
    renderInsights('loading');
    expect(screen.getByText('Loading insights...')).toBeTruthy();
  });

  it('renders empty state', () => {
    renderInsights('empty');
    expect(screen.getByText('No insights yet')).toBeTruthy();
    expect(screen.getByText(/Insights will appear once tickets start flowing/)).toBeTruthy();
  });

  it('renders error state with correct headline', () => {
    renderInsights('error');
    expect(screen.getByText('Insights could not be loaded')).toBeTruthy();
    expect(screen.getByText(/Live Insights is not this ticket/)).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });
});
