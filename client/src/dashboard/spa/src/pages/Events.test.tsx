import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { EventsPage } from './Events.js';
import { api } from '../api/client.js';
import type { ActivityEventRow, ActivityEventsResponse } from '../api/types.js';

vi.mock('../api/client.js', () => ({
  api: {
    getActivityEvents: vi.fn(),
  },
}));

let nav: ReturnType<typeof memoryLocation>;

function wrap(ui: JSX.Element, path = '/events'): void {
  nav = memoryLocation({ path, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={nav.hook}>{ui}</Router>
    </QueryClientProvider>,
  );
}

function row(id: number, kind: string, extra: Partial<ActivityEventRow> = {}): ActivityEventRow {
  return {
    id,
    ts: `2026-05-01T00:00:${String(id % 60).padStart(2, '0')}Z`,
    kind,
    requestId: `req-${id}`,
    serviceIndex: null,
    txHash: null,
    solverType: null,
    outcome: 'ok',
    detail: null,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('<EventsPage />', () => {
  it('renders event rows with human-readable labels (no raw snake_case)', async () => {
    vi.mocked(api.getActivityEvents).mockResolvedValue({
      events: [row(3, 'task_posted'), row(2, 'request_claimed'), row(1, 'reward_claimed')],
      nextCursor: null,
      counts: { task_posted: 1, request_claimed: 1, reward_claimed: 1 },
    } satisfies ActivityEventsResponse);
    wrap(<EventsPage />);
    await waitFor(() => {
      expect(screen.getAllByTestId('events-row')).toHaveLength(3);
    });
    const list = screen.getByTestId('events-list');
    expect(within(list).getByText('Task posted')).toBeTruthy();
    expect(within(list).getByText('Request claimed')).toBeTruthy();
    // no raw snake_case anywhere
    expect(screen.queryByText('task_posted')).toBeNull();
  });

  it('shows no 12-cap — renders all events across multiple pages', async () => {
    const page1: ActivityEventsResponse = {
      events: Array.from({ length: 50 }, (_, i) => row(100 - i, 'task_posted')),
      nextCursor: 51,
      counts: { task_posted: 60 },
    };
    const page2: ActivityEventsResponse = {
      events: Array.from({ length: 10 }, (_, i) => row(50 - i, 'task_posted')),
      nextCursor: null,
      counts: { task_posted: 60 },
    };
    vi.mocked(api.getActivityEvents).mockImplementation(async (opts) => {
      return opts?.beforeId === 51 ? page2 : page1;
    });
    wrap(<EventsPage />);
    await waitFor(() => {
      expect(screen.getAllByTestId('events-row')).toHaveLength(50);
    });
    // a full first page must offer "Load more"
    const loadMore = screen.getByTestId('events-load-more');
    fireEvent.click(loadMore);
    await waitFor(() => {
      expect(screen.getAllByTestId('events-row')).toHaveLength(60);
    });
    // after the last page, the button is gone
    expect(screen.queryByTestId('events-load-more')).toBeNull();
  });

  it('narrows the list when a kind filter is applied', async () => {
    vi.mocked(api.getActivityEvents).mockImplementation(async (opts) => {
      if (opts?.kinds && opts.kinds.includes('reward_claimed')) {
        return { events: [row(1, 'reward_claimed')], nextCursor: null, counts: { task_posted: 2, reward_claimed: 1 } };
      }
      return {
        events: [row(3, 'task_posted'), row(2, 'task_posted'), row(1, 'reward_claimed')],
        nextCursor: null,
        counts: { task_posted: 2, reward_claimed: 1 },
      };
    });
    wrap(<EventsPage />);
    await waitFor(() => {
      expect(screen.getAllByTestId('events-row')).toHaveLength(3);
    });
    fireEvent.click(screen.getByTestId('events-kind-filter-reward_claimed'));
    await waitFor(() => {
      expect(screen.getAllByTestId('events-row')).toHaveLength(1);
    });
    expect(within(screen.getByTestId('events-list')).getByText('Reward claimed')).toBeTruthy();
  });

  it('narrows the list when an outcome filter is applied', async () => {
    vi.mocked(api.getActivityEvents).mockImplementation(async (opts) => {
      if (opts?.outcome === 'failed') {
        return { events: [row(2, 'tick_error', { outcome: 'failed' })], nextCursor: null, counts: {} };
      }
      return {
        events: [row(2, 'tick_error', { outcome: 'failed' }), row(1, 'task_posted')],
        nextCursor: null,
        counts: {},
      };
    });
    wrap(<EventsPage />);
    await waitFor(() => {
      expect(screen.getAllByTestId('events-row')).toHaveLength(2);
    });
    fireEvent.click(screen.getByTestId('events-outcome-failed'));
    await waitFor(() => {
      expect(screen.getAllByTestId('events-row')).toHaveLength(1);
    });
    expect(within(screen.getByTestId('events-list')).getByText('Tick error')).toBeTruthy();
  });

  it('navigates to the event detail route when a row is clicked', async () => {
    vi.mocked(api.getActivityEvents).mockResolvedValue({
      events: [row(7, 'delivery_submitted')],
      nextCursor: null,
      counts: {},
    });
    wrap(<EventsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('events-row')).toBeTruthy();
    });
    const link = screen.getByTestId('events-row');
    expect(link.getAttribute('href')).toBe('/events/7');
  });

  it('shows the empty state when there are no events', async () => {
    vi.mocked(api.getActivityEvents).mockResolvedValue({
      events: [],
      nextCursor: null,
      counts: {},
    });
    wrap(<EventsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('events-empty')).toBeTruthy();
    });
  });

  it('shows an operable error state with a working retry', async () => {
    vi.mocked(api.getActivityEvents).mockRejectedValueOnce(new Error('events unavailable'));
    wrap(<EventsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('events-error')).toBeTruthy();
    });
    expect(screen.getByText(/events unavailable/i)).toBeTruthy();
    vi.mocked(api.getActivityEvents).mockResolvedValue({ events: [], nextCursor: null, counts: {} });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => {
      expect(screen.queryByTestId('events-error')).toBeNull();
    });
  });
});
