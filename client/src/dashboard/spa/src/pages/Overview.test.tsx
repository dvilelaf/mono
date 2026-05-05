import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Overview's empty-state gating depends on the prediction operator
 * payload. We mock `api.getStatus` per-test so the page receives the
 * shape we want to assert against. (jinn-mono-l2zl.15.4.12)
 */
const getStatusMock = vi.fn();

vi.mock('../api/client.js', () => ({
  api: {
    getStatus: () => getStatusMock(),
    claimRewards: async () => ({ ok: true }),
    restartDaemon: async () => ({ ok: true }),
  },
}));

// Import after the mock so the page picks up the mocked client.
const { OverviewPage } = await import('./Overview.js');

function withProviders(node: JSX.Element): JSX.Element {
  const { hook } = memoryLocation({ path: '/overview' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <Router hook={hook}>{node}</Router>
    </QueryClientProvider>
  );
}

/** Match the OperatorCard's `<span>Your {name}</span>` eyebrow exactly. */
function operatorEyebrow(name: string): (_: string, el: Element | null) => boolean {
  return (_, el) =>
    el?.tagName === 'SPAN' && el.textContent?.trim() === `Your ${name}`;
}

describe('OverviewPage empty-state gating', () => {
  it('shows the "Pick a SolverNet" prompt when no SolverNet is opted in', async () => {
    getStatusMock.mockResolvedValue({
      predictionV1: {
        operator: {
          ok: true,
          solverNet: { name: 'prediction', enabled: false },
          diagnostics: [],
        },
        totals: { observedTasks: 0, activeTaskRuns: 0, solutions: 0, verdicts: 0, failed: 0 },
      },
      fleet: { services: [] },
    });
    render(withProviders(<OverviewPage />));

    expect(await screen.findByText(/pick a solvernet to participate in/i)).toBeTruthy();
    // OperatorCard's "Your <name>" eyebrow must NOT render in this state.
    expect(screen.queryByText(operatorEyebrow('prediction'))).toBeNull();
  });

  it('shows the OperatorCard (and hides the prompt) when the SolverNet is enabled', async () => {
    getStatusMock.mockResolvedValue({
      predictionV1: {
        operator: {
          ok: true,
          solverNet: { name: 'prediction', enabled: true },
          diagnostics: [],
          nextAction: { description: 'Waiting for tasks.' },
        },
        totals: { observedTasks: 0, activeTaskRuns: 0, solutions: 0, verdicts: 0, failed: 0 },
      },
      fleet: { services: [] },
    });
    render(withProviders(<OverviewPage />));

    // useQuery resolves on the next microtask; wait for the operator-card
    // eyebrow to materialize before asserting the empty-state is gone.
    await waitFor(() =>
      expect(screen.getByText(operatorEyebrow('prediction'))).toBeTruthy(),
    );
    expect(screen.queryByText(/pick a solvernet to participate in/i)).toBeNull();
  });

  it('shows the OperatorCard for an opted-in operator without a role field', async () => {
    // The operator-status payload does not currently expose role. Until
    // jinn-mono-l2zl.15.4.8 lands, any enabled SolverNet must light up
    // the OperatorCard regardless of the role configured in the daemon.
    getStatusMock.mockResolvedValue({
      predictionV1: {
        operator: {
          ok: true,
          solverNet: { name: 'prediction', enabled: true },
          diagnostics: [],
        },
        totals: { observedTasks: 0, activeTaskRuns: 0, solutions: 0, verdicts: 0, failed: 0 },
      },
      fleet: { services: [] },
    });
    render(withProviders(<OverviewPage />));

    await waitFor(() =>
      expect(screen.getByText(operatorEyebrow('prediction'))).toBeTruthy(),
    );
    expect(screen.queryByText(/pick a solvernet to participate in/i)).toBeNull();
  });

  it('shows the prompt when the operator payload is missing entirely', async () => {
    getStatusMock.mockResolvedValue({ fleet: { services: [] } });
    render(withProviders(<OverviewPage />));

    expect(await screen.findByText(/pick a solvernet to participate in/i)).toBeTruthy();
    expect(screen.queryByText(operatorEyebrow('prediction'))).toBeNull();
  });
});
