import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GeneratorStatusCard, type GeneratorStatus } from './GeneratorStatusCard.js';

const activeStatus: GeneratorStatus = {
  state: 'active',
  lastPollAt: '2026-05-05T15:00:00Z',
  lastPollSummary: { evaluated: 3, posted: 2, skipped: 1 },
  cadenceMs: 21_600_000,
  stale: false,
};

const staleStatus: GeneratorStatus = { ...activeStatus, stale: true };

const erroredStatus: GeneratorStatus = {
  state: 'errored',
  lastError: { message: 'polymarket 503', at: '2026-05-05T14:00:00Z' },
  cadenceMs: 21_600_000,
  stale: false,
};

const pausedStatus: GeneratorStatus = {
  state: 'paused',
  cadenceMs: 21_600_000,
};

describe('GeneratorStatusCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders state pill, last poll timestamp, and last poll summary', () => {
    render(<GeneratorStatusCard status={activeStatus} />);
    expect(screen.queryAllByText(/Active/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/last poll/i)).toBeTruthy();
    expect(screen.queryByText(/3 evaluated/i)).toBeTruthy();
    expect(screen.queryByText(/2 posted/i)).toBeTruthy();
  });

  it('renders stale banner when stale=true', () => {
    render(<GeneratorStatusCard status={staleStatus} />);
    const alert = screen.queryByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert!.textContent).toMatch(/stuck|stale|expected/i);
  });

  it('renders error banner when state=errored', () => {
    render(<GeneratorStatusCard status={erroredStatus} />);
    const alert = screen.queryByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert!.textContent).toMatch(/polymarket 503/i);
  });

  it('renders paused state without summary or alert', () => {
    render(<GeneratorStatusCard status={pausedStatus} />);
    expect(screen.queryAllByText(/Paused/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeFalsy();
  });
});
