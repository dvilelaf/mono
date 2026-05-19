import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Tests for the operator-side registry catalog. Each test mocks
 * `api.solvernets.listRegistry` per its scenario; the dynamic-import dance
 * mirrors `Overview.test.tsx` so the mock takes effect before the component
 * picks up the api module.
 */

const listRegistryMock = vi.fn();
const listJoinedMock = vi.fn();

vi.mock('../../api/client.js', () => ({
  api: {
    operator: {
      listJoined: () => listJoinedMock(),
    },
    solvernets: {
      listRegistry: () => listRegistryMock(),
    },
  },
}));

const { RegistryCatalog } = await import('./RegistryCatalog.js');

function withProviders(node: JSX.Element, path = '/operator'): JSX.Element {
  const { hook } = memoryLocation({ path });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <Router hook={hook}>{node}</Router>
    </QueryClientProvider>
  );
}

describe('RegistryCatalog', () => {
  beforeEach(() => {
    listRegistryMock.mockReset();
    listJoinedMock.mockReset();
    listJoinedMock.mockResolvedValue({ joinedSolverNets: {} });
  });

  it('shows the spec §12 empty-state copy when no SolverNets are launched', async () => {
    listRegistryMock.mockResolvedValue({
      summaries: [],
      lastRefreshedAt: null,
      lastError: null,
    });
    render(withProviders(<RegistryCatalog />));
    await waitFor(() =>
      expect(screen.getByTestId('registry-catalog-empty')).toBeTruthy(),
    );
    expect(
      screen.getByText(/no launched solvernets available\./i),
    ).toBeTruthy();
  });

  it('renders one card per registry summary with status badges and prices', async () => {
    listRegistryMock.mockResolvedValue({
      summaries: [
        {
          manifestCid: 'bafybeiaaa',
          solverNetId: 'agent5474_prediction.v1-1_aaaaaaaa',
          name: 'Prediction Markets',
          network: 'base-sepolia',
          launcherAgentId: '5474',
          launcherSafeAddress: '0xE64bAfABCDEF0123456789abcdef0123456789B5CF',
          status: 'launched',
          statusUpdatedAt: '2026-05-05T00:00:00Z',
          contractId: 'prediction',
          contractVersion: 'v1',
          solutionPriceWei: '1000000000000000', // 0.001 ETH
          verdictPriceWei: '500000000000000', // 0.0005 ETH
          openRoles: ['solver', 'evaluator'],
          anchorBlock: 1,
        },
        {
          manifestCid: 'bafybeibbb',
          solverNetId: 'agent9999_prediction.v1-1_bbbbbbbb',
          name: 'Sports Prediction',
          network: 'base-sepolia',
          launcherAgentId: '9999',
          launcherSafeAddress: '0xAA112233445566778899AABBCCDDEEFF11223344',
          status: 'paused',
          statusUpdatedAt: '2026-05-05T00:00:00Z',
          contractId: 'prediction',
          contractVersion: 'v1',
          solutionPriceWei: '2000000000000000',
          verdictPriceWei: '1000000000000000',
          openRoles: ['solver'],
          anchorBlock: 2,
        },
        {
          manifestCid: 'bafybeiccc',
          solverNetId: 'agent1234_prediction.v1-1_cccccccc',
          name: 'Retired Net',
          network: 'base-sepolia',
          launcherAgentId: '1234',
          launcherSafeAddress: '0x0000000000000000000000000000000000000000',
          status: 'retired',
          statusUpdatedAt: '2026-05-05T00:00:00Z',
          contractId: 'prediction',
          contractVersion: 'v1',
          solutionPriceWei: '1000000000000000',
          verdictPriceWei: '500000000000000',
          openRoles: [],
          anchorBlock: 3,
        },
      ],
      lastRefreshedAt: '2026-05-05T01:00:00Z',
      lastError: null,
    });
    render(withProviders(<RegistryCatalog />));
    await waitFor(() =>
      expect(screen.queryAllByTestId('registry-card')).toHaveLength(3),
    );

    expect(screen.getByText('Prediction Markets')).toBeTruthy();
    expect(screen.getByText('Sports Prediction')).toBeTruthy();
    expect(screen.getByText('Retired Net')).toBeTruthy();

    // Status badges reflect each summary's status verbatim.
    const badges = screen.getAllByTestId('registry-status-badge');
    expect(badges.map((b) => b.getAttribute('data-status'))).toEqual([
      'launched',
      'paused',
      'retired',
    ]);

    // Open-role chips render for the launched + paused entries.
    const roleChips = screen.getAllByTestId('registry-open-role');
    expect(roleChips.length).toBeGreaterThanOrEqual(3);
  });

  it('hides SolverNets that are already joined from Discover', async () => {
    listJoinedMock.mockResolvedValue({
      joinedSolverNets: {
        bafybeiaaa: { manifestCid: 'bafybeiaaa', roles: ['solver'] },
      },
    });
    listRegistryMock.mockResolvedValue({
      summaries: [
        {
          manifestCid: 'bafybeiaaa',
          solverNetId: 'agent5474_prediction.v1-1_aaaaaaaa',
          name: 'Already Joined',
          network: 'base-sepolia',
          launcherAgentId: '5474',
          launcherSafeAddress: '0xE64bAfABCDEF0123456789abcdef0123456789B5CF',
          status: 'launched',
          statusUpdatedAt: '2026-05-05T00:00:00Z',
          contractId: 'prediction',
          contractVersion: 'v1',
          solutionPriceWei: '10000000000',
          verdictPriceWei: '5000000000',
          openRoles: ['solver'],
          anchorBlock: 1,
        },
        {
          manifestCid: 'bafybeibbb',
          solverNetId: 'agent9999_prediction.v1-1_bbbbbbbb',
          name: 'Not Joined',
          network: 'base-sepolia',
          launcherAgentId: '9999',
          launcherSafeAddress: '0xAA112233445566778899AABBCCDDEEFF11223344',
          status: 'launched',
          statusUpdatedAt: '2026-05-05T00:00:00Z',
          contractId: 'prediction',
          contractVersion: 'v1',
          solutionPriceWei: '10000000000',
          verdictPriceWei: '5000000000',
          openRoles: ['solver'],
          anchorBlock: 2,
        },
      ],
      lastRefreshedAt: null,
      lastError: null,
    });

    render(withProviders(<RegistryCatalog />));

    await waitFor(() =>
      expect(screen.queryAllByTestId('registry-card')).toHaveLength(1),
    );
    expect(screen.queryByText('Already Joined')).toBeNull();
    expect(screen.getByText('Not Joined')).toBeTruthy();
  });

  it('shows the unjoined empty-state copy when all SolverNets are already joined', async () => {
    listJoinedMock.mockResolvedValue({
      joinedSolverNets: {
        bafybeiaaa: { manifestCid: 'bafybeiaaa', roles: ['solver'] },
      },
    });
    listRegistryMock.mockResolvedValue({
      summaries: [
        {
          manifestCid: 'bafybeiaaa',
          solverNetId: 'agent5474_prediction.v1-1_aaaaaaaa',
          name: 'Already Joined',
          network: 'base-sepolia',
          launcherAgentId: '5474',
          launcherSafeAddress: '0xE64bAfABCDEF0123456789abcdef0123456789B5CF',
          status: 'launched',
          statusUpdatedAt: '2026-05-05T00:00:00Z',
          contractId: 'prediction',
          contractVersion: 'v1',
          solutionPriceWei: '10000000000',
          verdictPriceWei: '5000000000',
          openRoles: ['solver'],
          anchorBlock: 1,
        },
      ],
      lastRefreshedAt: null,
      lastError: null,
    });

    render(withProviders(<RegistryCatalog />));

    await waitFor(() =>
      expect(screen.getByTestId('registry-catalog-empty')).toBeTruthy(),
    );
    expect(
      screen.getByText(/no unjoined solvernets available\./i),
    ).toBeTruthy();
  });

  it('formats tiny live prices as gwei instead of scientific ETH notation', async () => {
    listRegistryMock.mockResolvedValue({
      summaries: [
        {
          manifestCid: 'bafybeiaaa',
          solverNetId: 'agent5474_swe-rebench-v2-v1_aaaaaaaa',
          name: 'SWE-rebench v2',
          network: 'base-sepolia',
          launcherAgentId: '5474',
          launcherSafeAddress: '0xE64bAfABCDEF0123456789abcdef0123456789B5CF',
          status: 'launched',
          statusUpdatedAt: '2026-05-05T00:00:00Z',
          contractId: 'swe-rebench-v2',
          contractVersion: 'v1',
          solutionPriceWei: '10000000000',
          verdictPriceWei: '5000000000',
          openRoles: ['solver', 'evaluator'],
          anchorBlock: 1,
        },
      ],
      lastRefreshedAt: null,
      lastError: null,
    });

    render(withProviders(<RegistryCatalog />));

    await waitFor(() =>
      expect(screen.getByText('SWE-rebench v2')).toBeTruthy(),
    );
    expect(screen.getByText('10 gwei')).toBeTruthy();
    expect(screen.getByText('5 gwei')).toBeTruthy();
    expect(screen.queryByText(/\d\.\d+e-/i)).toBeNull();
  });

  it('routes the Join CTA to /operator/join/<manifestCid> for launched nets', async () => {
    listRegistryMock.mockResolvedValue({
      summaries: [
        {
          manifestCid: 'bafybeiaaa',
          solverNetId: 'agent5474_prediction.v1-1_aaaaaaaa',
          name: 'Prediction Markets',
          network: 'base-sepolia',
          launcherAgentId: '5474',
          launcherSafeAddress: '0xE64bAfABCDEF0123456789abcdef0123456789B5CF',
          status: 'launched',
          statusUpdatedAt: '2026-05-05T00:00:00Z',
          contractId: 'prediction',
          contractVersion: 'v1',
          solutionPriceWei: '1000000000000000',
          verdictPriceWei: '500000000000000',
          openRoles: ['solver'],
          anchorBlock: 1,
        },
      ],
      lastRefreshedAt: null,
      lastError: null,
    });
    render(withProviders(<RegistryCatalog />));
    const cta = await screen.findByTestId('registry-join-cta');
    expect(cta.getAttribute('href')).toBe('/operator/join/bafybeiaaa');
  });

  it('shows a loading state while the query resolves', () => {
    // Never-resolving promise keeps the query pending.
    listRegistryMock.mockReturnValue(new Promise(() => undefined));
    render(withProviders(<RegistryCatalog />));
    expect(screen.getByTestId('registry-catalog-loading')).toBeTruthy();
  });

  it('shows an error banner with retry when the query fails', async () => {
    listRegistryMock.mockRejectedValue(new Error('upstream subgraph error'));
    render(withProviders(<RegistryCatalog />));
    await waitFor(() =>
      expect(screen.getByTestId('registry-catalog-error')).toBeTruthy(),
    );
    expect(screen.getByText(/upstream subgraph error/i)).toBeTruthy();
    expect(screen.getByTestId('registry-catalog-retry')).toBeTruthy();
  });

  it('explains subsystem_not_ready registry errors as startup lag', async () => {
    listRegistryMock.mockRejectedValue(
      Object.assign(new Error('503 Service Unavailable: SolverNet subsystem still initialising'), {
        status: 503,
        code: 'subsystem_not_ready',
      }),
    );

    render(withProviders(<RegistryCatalog />));

    await waitFor(() =>
      expect(screen.getByText(/solvernet subsystem is still starting/i)).toBeTruthy(),
    );
    expect(screen.getByText(/wait a few seconds, then retry/i)).toBeTruthy();
  });

  it('explains registry_unavailable errors as registry cache failures', async () => {
    listRegistryMock.mockRejectedValue(
      Object.assign(new Error('503 Service Unavailable: registry_unavailable'), {
        status: 503,
        code: 'registry_unavailable',
      }),
    );

    render(withProviders(<RegistryCatalog />));

    await waitFor(() =>
      expect(screen.getByText(/registry cache is unavailable/i)).toBeTruthy(),
    );
    expect(screen.getByText(/check daemon logs/i)).toBeTruthy();
  });

  it('explains Failed to fetch as daemon unreachable (jinn-mono-hjex.8)', async () => {
    // Simulates the browser TypeError raised when the daemon is not running —
    // fetch raises this when the connection is refused at the transport layer.
    listRegistryMock.mockRejectedValue(
      Object.assign(new TypeError('Failed to fetch'), {}),
    );

    render(withProviders(<RegistryCatalog />));

    await waitFor(() =>
      expect(screen.getByText(/daemon unreachable/i)).toBeTruthy(),
    );
    expect(screen.getByText(/jinn run.*still active/i)).toBeTruthy();
  });

  it('does not replace catalog with error panel when a refetch fails over stale data (jinn-mono-hjex.9)', async () => {
    // First fetch succeeds — react-query caches the registry data.
    listRegistryMock.mockResolvedValue({
      summaries: [
        {
          manifestCid: 'bafybeiswe',
          solverNetId: 'agent5474_swe-rebench-v2-v1_aaaaaaaa',
          name: 'SWE-rebench v2',
          network: 'base-sepolia',
          launcherAgentId: '5474',
          launcherSafeAddress: '0xE64bAfABCDEF0123456789abcdef0123456789B5CF',
          status: 'launched',
          statusUpdatedAt: '2026-05-05T00:00:00Z',
          contractId: 'swe-rebench-v2',
          contractVersion: 'v1',
          solutionPriceWei: '10000000000',
          verdictPriceWei: '5000000000',
          openRoles: ['solver', 'evaluator'],
          anchorBlock: 1,
        },
      ],
      lastRefreshedAt: '2026-05-05T01:00:00Z',
      lastError: null,
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    const { hook } = memoryLocation({ path: '/operator' });
    render(
      <QueryClientProvider client={qc}>
        <Router hook={hook}>
          <RegistryCatalog refetchIntervalMs={0} />
        </Router>
      </QueryClientProvider>,
    );

    // Wait for initial successful render.
    await waitFor(() => expect(screen.getByText('SWE-rebench v2')).toBeTruthy());

    // Simulate failed background refetch.
    listRegistryMock.mockRejectedValue(new Error('network error'));
    await act(async () => {
      // refetchQueries resolves even when the query fails — the query state
      // transitions to isError=true while retaining the previous data.
      await qc.refetchQueries({ queryKey: ['solvernets', 'registry'] });
    });

    // Stale card data is still visible.
    await waitFor(() => expect(screen.getByText('SWE-rebench v2')).toBeTruthy());

    // The fatal error panel must NOT replace the catalog.
    expect(screen.queryByTestId('registry-catalog-error')).toBeNull();

    // A low-severity stale indicator must appear instead.
    await waitFor(() => expect(screen.getByTitle(/last refresh failed/i)).toBeTruthy());
  });

  it('retry refetches BOTH registry and joined queries when joined-list fatal arm fires (jinn-mono-hjex.9)', async () => {
    // Registry query succeeds; joined-list query has never succeeded. This is
    // the second fatal arm — `joinedQuery.isError && joinedQuery.data === undefined`.
    // The Retry button must refetch BOTH queries, not just `refetch` (registry),
    // otherwise the user is stuck because the failing query (joined-list) is
    // never re-triggered.
    listRegistryMock.mockResolvedValue({
      summaries: [],
      lastRefreshedAt: '2026-05-05T01:00:00Z',
      lastError: null,
    });
    listJoinedMock.mockRejectedValue(new Error('joined list network error'));

    render(withProviders(<RegistryCatalog />));

    // Fatal panel renders because joined-list has no data.
    await waitFor(() =>
      expect(screen.getByTestId('registry-catalog-error')).toBeTruthy(),
    );
    expect(screen.getByText(/joined list network error/i)).toBeTruthy();

    // Baseline: each query was called once on mount.
    expect(listRegistryMock).toHaveBeenCalledTimes(1);
    expect(listJoinedMock).toHaveBeenCalledTimes(1);

    // Click Retry; both queries must refetch.
    await act(async () => {
      fireEvent.click(screen.getByTestId('registry-catalog-retry'));
    });

    await waitFor(() => expect(listJoinedMock).toHaveBeenCalledTimes(2));
    expect(listRegistryMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces lastRefreshedAt and lastError from the response envelope', async () => {
    listRegistryMock.mockResolvedValue({
      summaries: [],
      lastRefreshedAt: '2026-05-05T01:23:00Z',
      lastError: { message: 'subgraph 502', at: '2026-05-05T01:24:00Z' },
    });
    render(withProviders(<RegistryCatalog />));
    await waitFor(() =>
      expect(screen.getByTestId('registry-catalog-meta')).toBeTruthy(),
    );
    expect(screen.getByTestId('registry-catalog-meta').textContent).toContain(
      '2026-05-05',
    );
    expect(screen.getByTestId('registry-catalog-warn').textContent).toContain(
      'subgraph 502',
    );
  });
});
