// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { CallsView } from './Calls';

function renderCalls(status: 'ready' | 'loading' | 'empty' | 'error' = 'ready') {
  return render(
    <MemoryRouter>
      <CallsView status={status} onRetry={() => {}} />
    </MemoryRouter>,
  );
}

describe('CallsView', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders ready state with call list', () => {
    renderCalls('ready');
    expect(screen.getByText('Calls')).toBeTruthy();
    expect(screen.getByText(/logged this week/)).toBeTruthy();
  });

  it('renders loading state', () => {
    renderCalls('loading');
    expect(screen.getByText('Loading calls...')).toBeTruthy();
  });

  it('renders empty state', () => {
    renderCalls('empty');
    expect(screen.getByText('No calls yet')).toBeTruthy();
    expect(screen.getByText(/Calls will appear here once agents start logging them/)).toBeTruthy();
  });

  it('renders error state with correct headline', () => {
    renderCalls('error');
    expect(screen.getByText('Calls could not be loaded')).toBeTruthy();
    expect(screen.getByText(/Live call ingest is not this ticket/)).toBeTruthy();
  });
});
