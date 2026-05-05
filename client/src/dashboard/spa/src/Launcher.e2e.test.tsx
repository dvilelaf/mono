import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * End-to-end happy path for the Launcher mode (Task 18 of
 * docs/superpowers/plans/2026-05-05-launcher-role-and-mode-plan.md).
 *
 * Walks the full user flow against the real `App` component:
 *
 *   1. Default Operator mode renders on /overview after bootstrap.
 *   2. Click ModeSwitch -> Launcher; URL flips to /launcher and the
 *      EmptyState surfaces because no SolverNet has 'launching' role.
 *   3. CTA opens the 4-step SetupFlow.
 *   4. Walk Next x3 -> Save fires `patchLauncherSolverNet` with
 *      `{ launching: true }`.
 *   5. After save, the configured-state cards render with the
 *      Prediction intent line.
 *   6. Switch back to Operator mode; launcher state must NOT leak
 *      into Operator (strict separation per spec §6.3).
 *   7. localStorage persists the most-recent mode under
 *      `jinn.app.mode`.
 *
 * All daemon-side api calls are mocked. Bootstrap returns `mode:
 * 'running'` so App.tsx routes to the operating shell instead of
 * Onboarding.
 */

vi.mock('./api/client.js', () => ({
  api: {
    getBootstrap: vi.fn(),
    getStatus: vi.fn(),
    claimRewards: vi.fn(),
    restartDaemon: vi.fn(),
    fetchLauncherStatus: vi.fn(),
    fetchLauncherTasks: vi.fn(),
    patchLauncherSolverNet: vi.fn(),
  },
  ensureSessionToken: vi.fn(),
}));

// AgentRail pulls in xterm + WebSocket, neither of which is happy in
// jsdom. Stub it; this test exercises mode-switching, not the agent
// terminal.
vi.mock('./shell/AgentRail.js', () => ({
  AgentRail: () => null,
}));

// `useEventStream` opens an EventSource on mount; jsdom has no
// EventSource. LoadingScreen briefly renders before the bootstrap query
// resolves, so this stub is required even with AgentRail stubbed.
vi.mock('./api/events.js', () => ({
  useEventStream: () => ({ events: [], connected: false }),
}));

const App = (await import('./App.js')).default;
const { api } = await import('./api/client.js');

function wrap(ui: JSX.Element): ReturnType<typeof render> {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const runningBootstrap = {
  schemaVersion: 1 as const,
  mode: 'running' as const,
  steps: [],
  currentStep: 'complete',
  services: [],
  master_address: '0xE64bAf0073a71b0Cb2C0558bB16f24b45E1FB5CF',
  chain: 'base-sepolia',
};

const operatorStatusEmpty = {
  predictionV1: {
    operator: {
      ok: true,
      solverNet: { name: 'prediction', enabled: false },
      diagnostics: [],
    },
    totals: { observedTasks: 0, activeTaskRuns: 0, solutions: 0, verdicts: 0, failed: 0 },
  },
  fleet: { services: [] },
  rewards: { pendingStakingRewardsWei: '0' },
  masterGas: { balanceWei: '0', runwayDaysExcess: 0 },
};

const emptyLauncherStatus = {
  schemaVersion: 1 as const,
  generatedAt: '2026-05-05T15:00:00Z',
  nets: [],
};

const emptyLauncherTasks = {
  schemaVersion: 1 as const,
  generatedAt: '2026-05-05T15:00:00Z',
  tasks: [],
};

const launchingLauncherStatus = {
  schemaVersion: 1 as const,
  generatedAt: '2026-05-05T15:00:00Z',
  nets: [
    {
      name: 'prediction',
      generator: {
        state: 'active' as const,
        cadenceMs: 21_600_000,
        lastPollAt: '2026-05-05T15:00:00Z',
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
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Reset jsdom URL to root so wouter's browser location starts clean.
  window.history.pushState({}, '', '/');
  vi.mocked(api.getBootstrap).mockResolvedValue(runningBootstrap);
  vi.mocked(api.getStatus).mockResolvedValue(operatorStatusEmpty);
  vi.mocked(api.claimRewards).mockResolvedValue({ ok: true });
  vi.mocked(api.restartDaemon).mockResolvedValue({ ok: true });
  vi.mocked(api.fetchLauncherStatus).mockResolvedValue(emptyLauncherStatus);
  vi.mocked(api.fetchLauncherTasks).mockResolvedValue(emptyLauncherTasks);
  vi.mocked(api.patchLauncherSolverNet).mockResolvedValue({
    ok: true,
    name: 'prediction',
    roles: ['launching'],
    generator: {},
  });
});

describe('Launcher mode end-to-end happy path', () => {
  it('walks Operator -> Launcher -> setup -> configured -> back to Operator', async () => {
    wrap(<App />);

    // 1. Default Operator mode: App redirects to /overview after the
    //    running-bootstrap query resolves; the Header's "jinn operator"
    //    brand and ModeSwitch surface.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Operator' })).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Operator' }).getAttribute('data-active')).toBe('true');

    // 2. Click ModeSwitch -> Launcher. Header.onModeChange flips both the
    //    persisted mode and routes to /launcher; LauncherPage's empty
    //    state appears because no SolverNet has 'launching' role.
    fireEvent.click(screen.getByRole('button', { name: 'Launcher' }));
    await waitFor(() =>
      expect(screen.getByText(/You haven't launched a SolverNet yet/i)).toBeTruthy(),
    );

    // 3. Empty-state CTA -> setup flow. Step 1 of 4 mentions the
    //    Prediction intent line.
    fireEvent.click(screen.getByRole('button', { name: /Launch Prediction SolverNet/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Next$/i })).toBeTruthy(),
    );

    // 4. Walk 4-step setup. Steps 1-3 show "Next"; step 4 swaps for "Save".
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i })); // step 1 -> 2
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i })); // step 2 -> 3
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i })); // step 3 -> 4

    // Update mocked status so the next refetch sees the launching net.
    vi.mocked(api.fetchLauncherStatus).mockResolvedValue(launchingLauncherStatus);

    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() =>
      expect(api.patchLauncherSolverNet).toHaveBeenCalledWith(
        'prediction',
        expect.objectContaining({ launching: true }),
      ),
    );

    // 5. After save, configured-state cards render with the Prediction
    //    intent line in KnowledgeProductionCard.
    await waitFor(() =>
      expect(
        screen.getByText(/Calibrated probabilistic forecasts of Polymarket-listed events/i),
      ).toBeTruthy(),
    );

    // 6. Switch back to Operator. Launcher state must NOT leak -- the
    //    KnowledgeProductionCard intent line is gone from the DOM, and the
    //    EmptyState heading from launcher is also absent.
    fireEvent.click(screen.getByRole('button', { name: 'Operator' }));
    await waitFor(() =>
      expect(
        screen.queryByText(/Calibrated probabilistic forecasts of Polymarket-listed events/i),
      ).toBeNull(),
    );
    expect(screen.queryByText(/You haven't launched a SolverNet yet/i)).toBeNull();

    // 7. localStorage persists the most-recent mode (operator after the
    //    back-switch) under the canonical key.
    expect(localStorage.getItem('jinn.app.mode')).toBe('operator');
  });
});
