import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../api/client.js';
import type { ActivityEventRow, ActivityEventsResponse } from '../api/types.js';
import {
  LIFECYCLE_KINDS,
  eventKindMeta,
  eventKindColor,
} from '../lib/event-kinds.js';

/**
 * /events — the dedicated Events page (issue #419).
 *
 * The full, paginated, filterable view of the persistent lifecycle event
 * stream (`activity_events`). Unlike the Overview "Recent" card — which shows
 * a compact ~12-event summary from /v1/status — this page has no cap: it pages
 * through every event via `/v1/activity-events` and supports kind / outcome
 * filtering.
 */

type OutcomeFilter = 'all' | 'ok' | 'failed' | 'warn';

const PAGE_SIZE = 50;

function formatTimestamp(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function truncateRequestId(requestId: string): string {
  if (requestId.length <= 14) return requestId;
  return `${requestId.slice(0, 8)}…${requestId.slice(-4)}`;
}

function txDisplay(txHash: string | null | undefined): string {
  if (!txHash) return '—';
  return txHash.length > 12 ? `${txHash.slice(0, 6)}…${txHash.slice(-4)}` : txHash;
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 'var(--radius-pill)',
    border: `1px solid ${active ? 'var(--accent-sky)' : 'var(--border)'}`,
    background: 'transparent',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: active ? 'var(--accent-sky)' : 'var(--fg-muted)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  };
}

export interface EventsPageProps {
  /** Override page size (tests). */
  pageSize?: number;
}

export function EventsPage({ pageSize = PAGE_SIZE }: EventsPageProps = {}): JSX.Element {
  const [selectedKinds, setSelectedKinds] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');

  const query = useInfiniteQuery<ActivityEventsResponse>({
    queryKey: ['activity-events', selectedKinds, outcome],
    queryFn: ({ pageParam }) =>
      api.getActivityEvents({
        kinds: selectedKinds.length > 0 ? selectedKinds : undefined,
        outcome: outcome === 'all' ? undefined : outcome,
        beforeId: typeof pageParam === 'number' ? pageParam : undefined,
        limit: pageSize,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const pages = query.data?.pages ?? [];
  const events: ActivityEventRow[] = pages.flatMap((p) => p.events);
  const counts = pages[0]?.counts ?? {};

  function toggleKind(kind: string): void {
    setSelectedKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
  }

  return (
    <main
      data-testid="events-page"
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '960px',
        margin: '0 auto',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <h1
          style={{
            fontFamily: "'Instrument Serif', 'Times New Roman', serif",
            fontSize: '32px',
            fontWeight: 400,
            margin: 0,
            color: 'var(--fg)',
          }}
        >
          Events
        </h1>
        <Link
          href="/overview"
          data-testid="events-back"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--accent-sky)',
            textDecoration: 'none',
          }}
        >
          ← Overview
        </Link>
      </header>

      <section
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={eyebrowStyle}>Filter by kind</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {LIFECYCLE_KINDS.map((kind) => {
              const active = selectedKinds.includes(kind);
              const count = counts[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  data-testid={`events-kind-filter-${kind}`}
                  aria-pressed={active ? 'true' : 'false'}
                  style={chipStyle(active)}
                  onClick={() => toggleKind(kind)}
                >
                  {eventKindMeta(kind).label}
                  {count !== undefined && (
                    <span style={{ color: 'var(--fg-dim)', fontSize: '10px' }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={eyebrowStyle}>Filter by outcome</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['all', 'ok', 'failed', 'warn'] as const).map((o) => (
              <button
                key={o}
                type="button"
                data-testid={`events-outcome-${o}`}
                aria-pressed={outcome === o ? 'true' : 'false'}
                style={chipStyle(outcome === o)}
                onClick={() => setOutcome(o)}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section
        data-testid="events-list-section"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <span style={eyebrowStyle}>Events · {events.length}</span>

        {query.isLoading && (
          <p
            data-testid="events-loading"
            style={{ margin: 0, color: 'var(--fg-muted)', fontSize: '12px' }}
          >
            Loading…
          </p>
        )}

        {query.isError && (
          <div
            role="alert"
            data-testid="events-error"
            style={{
              border: '1px solid var(--break-red)',
              borderRadius: '6px',
              padding: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span style={{ color: 'var(--break-red)', fontSize: '12px' }}>
              {query.error instanceof Error ? query.error.message : 'Failed to load events.'}
            </span>
            <button
              type="button"
              onClick={() => {
                void query.refetch();
              }}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--fg)',
                padding: '6px 10px',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!query.isLoading && !query.isError && events.length === 0 && (
          <p
            data-testid="events-empty"
            style={{ margin: 0, color: 'var(--fg-muted)', fontSize: '13px' }}
          >
            No events match the current filters.
          </p>
        )}

        {events.length > 0 && (
          <ul
            data-testid="events-list"
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0',
            }}
          >
            {events.map((row) => {
              const meta = eventKindMeta(row.kind);
              return (
                <li key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <Link
                    href={`/events/${row.id}`}
                    data-testid="events-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '160px 150px 1fr 80px 100px',
                      gap: '12px',
                      padding: '10px 0',
                      fontSize: '12px',
                      textDecoration: 'none',
                      color: 'inherit',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: 'var(--fg-dim)' }}>{formatTimestamp(row.ts)}</span>
                    <span
                      style={{
                        color: eventKindColor(row.kind, row.outcome),
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        fontSize: '11px',
                      }}
                    >
                      {meta.label}
                    </span>
                    <span
                      style={{ color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {row.requestId
                        ? truncateRequestId(row.requestId)
                        : row.solverType ?? '—'}
                    </span>
                    <span
                      style={{
                        color: row.outcome === 'failed' ? 'var(--break-red)' : 'var(--fg-muted)',
                        textTransform: 'uppercase',
                        fontSize: '10px',
                        letterSpacing: '0.1em',
                      }}
                    >
                      {row.outcome ?? '—'}
                    </span>
                    <span
                      style={{
                        color: row.txHash ? 'var(--accent-gold)' : 'var(--fg-dim)',
                        textAlign: 'right',
                      }}
                    >
                      {txDisplay(row.txHash)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {query.hasNextPage && (
          <button
            type="button"
            data-testid="events-load-more"
            disabled={query.isFetchingNextPage}
            onClick={() => {
              void query.fetchNextPage();
            }}
            style={{
              alignSelf: 'flex-start',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--fg)',
              padding: '8px 14px',
              cursor: query.isFetchingNextPage ? 'wait' : 'pointer',
            }}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>
    </main>
  );
}
