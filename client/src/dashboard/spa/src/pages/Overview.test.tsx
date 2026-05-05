import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

/**
 * Overview's empty-state gating depends on the prediction operator
 * payload. We mock `api.getStatus` per-test so the page receives the
 * shape we want to assert against. (jinn-mono-l2zl.15.4.12)
 */
const { getStatusMock } = vi.hoisted(() => ({
  getStatusMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: getStatusMock() }),
}));

vi.mock('../api/client.js', () => ({
  api: {
    getStatus: async () => getStatusMock(),
    claimRewards: async () => ({ ok: true }),
    restartDaemon: async () => ({ ok: true }),
  },
}));

// Import after the mock so the page picks up the mocked client.
const { OverviewPage } = await import('./Overview.js');

afterEach(() => {
  cleanup();
  getStatusMock.mockReset();
});

function withProviders(node: JSX.Element): JSX.Element {
  const { hook } = memoryLocation({ path: '/overview' });
  return (
    <Router hook={hook}>{node}</Router>
  );
}

/** Match the OperatorCard's `<span>Your {name}</span>` eyebrow exactly. */
function operatorEyebrow(name: string): (_: string, el: Element | null) => boolean {
  return (_, el) =>
    el?.tagName === 'SPAN' && el.textContent?.trim() === `Your ${name}`;
}

describe('OverviewPage empty-state gating', () => {
  it('shows the "Pick a SolverNet" prompt when no operator-visible roles are active', async () => {
    getStatusMock.mockReturnValue({
      predictionV1: {
        operator: {
          ok: true,
          solverNet: { name: 'prediction', enabled: false, roles: [] },
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

  it('shows the OperatorCard when roles include solving even if legacy enabled is false', async () => {
    getStatusMock.mockReturnValue({
      predictionV1: {
        operator: {
          ok: true,
          solverNet: { name: 'prediction', enabled: false, roles: ['solving'] },
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
    expect(screen.getByText(/^solver$/i)).toBeTruthy();
  });

  it('shows both role pills when roles include solving and evaluating', async () => {
    getStatusMock.mockReturnValue({
      predictionV1: {
        operator: {
          ok: true,
          solverNet: { name: 'prediction', enabled: false, roles: ['solving', 'evaluating'] },
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
    expect(screen.getByText(/^solver$/i)).toBeTruthy();
    expect(screen.getByText(/^evaluator$/i)).toBeTruthy();
  });

  it('does not show OperatorCard for a launcher-only role', async () => {
    getStatusMock.mockReturnValue({
      predictionV1: {
        operator: {
          ok: true,
          solverNet: { name: 'prediction', enabled: true, roles: ['launching'] },
          diagnostics: [],
        },
        totals: { observedTasks: 0, activeTaskRuns: 0, solutions: 0, verdicts: 0, failed: 0 },
      },
      fleet: { services: [] },
    });
    render(withProviders(<OverviewPage />));

    expect(await screen.findByText(/pick a solvernet to participate in/i)).toBeTruthy();
    expect(screen.queryByText(operatorEyebrow('prediction'))).toBeNull();
  });

  it('shows the prompt when the operator payload is missing entirely', async () => {
    getStatusMock.mockReturnValue({ fleet: { services: [] } });
    render(withProviders(<OverviewPage />));

    expect(await screen.findByText(/pick a solvernet to participate in/i)).toBeTruthy();
    expect(screen.queryByText(operatorEyebrow('prediction'))).toBeNull();
  });
});
