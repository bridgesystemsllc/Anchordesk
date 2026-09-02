// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { SheetsView } from './Sheets';

function renderSheets(status: 'ready' | 'loading' | 'empty' | 'error' = 'ready') {
  return render(
    <MemoryRouter>
      <SheetsView status={status} onRetry={() => {}} />
    </MemoryRouter>,
  );
}

describe('SheetsView', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders ready state with workbook grid', () => {
    renderSheets('ready');
    expect(screen.getByText('Sheets')).toBeTruthy();
    expect(screen.getByText(/Live from SharePoint via Graph/)).toBeTruthy();
  });

  it('renders loading state', () => {
    renderSheets('loading');
    expect(screen.getByText('Loading workbooks...')).toBeTruthy();
  });

  it('renders empty state', () => {
    renderSheets('empty');
    expect(screen.getByText('No workbooks')).toBeTruthy();
    expect(screen.getByText(/No Excel bindings are configured/)).toBeTruthy();
  });

  it('renders error state with correct headline', () => {
    renderSheets('error');
    expect(screen.getByText('Workbook could not be loaded')).toBeTruthy();
    expect(screen.getByText(/Live Graph workbook sessions are not this ticket/)).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });
});
