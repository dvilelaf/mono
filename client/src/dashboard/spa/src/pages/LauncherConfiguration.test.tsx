import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LauncherConfigurationPage } from './LauncherConfiguration.js';
import { api } from '../api/client.js';

vi.mock('../api/client.js', () => ({
  api: {
    fetchLauncherStatus: vi.fn(),
    patchLauncherSolverNet: vi.fn(),
  },
}));

function wrap(ui: JSX.Element): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('LauncherConfigurationPage', () => {
  it('renders generator config form for each launching SolverNet', async () => {
    vi.mocked(api.fetchLauncherStatus).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-05-05T15:00:00Z',
      nets: [
        {
          name: 'prediction',
          generator: { state: 'active', cadenceMs: 21_600_000, stale: false },
          openTasks: 0,
          budget: {
            safeAddress: '0xabc',
            safeBalanceWei: '0',
            reservedBudgetWei: '0',
          },
        },
      ],
    });
    wrap(<LauncherConfigurationPage />);
    await waitFor(() => expect(screen.queryByLabelText(/^Cadence$/i)).toBeTruthy());
    expect(screen.queryByText(/prediction generator/i)).toBeTruthy();
  });

  it('shows hint when no SolverNet has launching role', async () => {
    vi.mocked(api.fetchLauncherStatus).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-05-05T15:00:00Z',
      nets: [],
    });
    wrap(<LauncherConfigurationPage />);
    await waitFor(() =>
      expect(screen.queryByText(/No launching SolverNets/i)).toBeTruthy(),
    );
  });

  it('renders one section per launching net when multiple are present', async () => {
    vi.mocked(api.fetchLauncherStatus).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-05-05T15:00:00Z',
      nets: [
        {
          name: 'prediction',
          generator: { state: 'active', cadenceMs: 21_600_000, stale: false },
          openTasks: 0,
          budget: {
            safeAddress: '0xabc',
            safeBalanceWei: '0',
            reservedBudgetWei: '0',
          },
        },
        {
          name: 'forecast',
          generator: { state: 'paused', cadenceMs: 21_600_000, stale: false },
          openTasks: 0,
          budget: {
            safeAddress: '0xdef',
            safeBalanceWei: '0',
            reservedBudgetWei: '0',
          },
        },
      ],
    });
    wrap(<LauncherConfigurationPage />);
    await waitFor(() => expect(screen.queryByText(/prediction generator/i)).toBeTruthy());
    expect(screen.queryByText(/forecast generator/i)).toBeTruthy();
  });
});
