import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LauncherPage } from './Launcher.js';
import { api } from '../api/client.js';

vi.mock('../api/client.js', () => ({
  api: {
    fetchLauncherStatus: vi.fn(),
    fetchLauncherTasks: vi.fn(),
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

describe('LauncherPage', () => {
  it('renders empty state when no SolverNet has launching role', async () => {
    vi.mocked(api.fetchLauncherStatus).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-05-05T15:00:00Z',
      nets: [],
    });
    vi.mocked(api.fetchLauncherTasks).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-05-05T15:00:00Z',
      tasks: [],
    });
    wrap(<LauncherPage />);
    await waitFor(() =>
      expect(screen.queryByText(/You haven't launched a SolverNet yet/i)).toBeTruthy(),
    );
  });

  it('renders configured-state overview when a SolverNet has launching role', async () => {
    vi.mocked(api.fetchLauncherStatus).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-05-05T15:00:00Z',
      nets: [
        {
          name: 'prediction',
          generator: {
            state: 'active',
            cadenceMs: 21_600_000,
            lastPollAt: '2026-05-05T14:00:00Z',
            lastPollSummary: { evaluated: 3, posted: 2, skipped: 1 },
            stale: false,
          },
          openTasks: 2,
          budget: {
            safeAddress: '0xabc',
            safeBalanceWei: '1000000000000000000',
            reservedBudgetWei: '200000000000000000',
          },
        },
      ],
    });
    vi.mocked(api.fetchLauncherTasks).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-05-05T15:00:00Z',
      tasks: [],
    });
    wrap(<LauncherPage />);
    await waitFor(() =>
      expect(screen.queryByText(/Calibrated probabilistic forecasts/i)).toBeTruthy(),
    );
    expect(screen.queryAllByText(/Active/i).length).toBeGreaterThan(0);
  });

  it('opens setup flow on launch CTA click and patches launcher config on save', async () => {
    vi.mocked(api.fetchLauncherStatus).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-05-05T15:00:00Z',
      nets: [],
    });
    vi.mocked(api.fetchLauncherTasks).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-05-05T15:00:00Z',
      tasks: [],
    });
    vi.mocked(api.patchLauncherSolverNet).mockResolvedValue({
      ok: true,
      name: 'prediction',
      roles: ['launching'],
      generator: {},
    });
    wrap(<LauncherPage />);
    await waitFor(() => expect(screen.queryByText(/You haven't launched/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Launch Prediction SolverNet/i }));
    // Walk the wizard
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() =>
      expect(api.patchLauncherSolverNet).toHaveBeenCalledWith(
        'prediction',
        expect.objectContaining({ launching: true }),
      ),
    );
  });
});
