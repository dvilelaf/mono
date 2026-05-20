import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'wouter';
import { api } from '../api/client.js';
import type { ActivityEventRow, BootstrapState } from '../api/types.js';
import { eventKindMeta, eventKindColor } from '../lib/event-kinds.js';

/**
 * /events/:id — the event detail view (issue #419).
 *
 * Progressive disclosure: a plain-language summary ("what it did") on top,
 * then a structured payload card with the raw fields — request id, tx hash
 * (linked to the block explorer), service index, solver type, detail.
 */

function formatTimestamp(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--fg-muted)',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  fontFamily: "'JetBrains Mono', monospace",
};

function DefRow({ term, children }: { term: string; children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: '12px',
        padding: '8px 0',
        borderTop: '1px solid var(--border)',
        fontSize: '12px',
        alignItems: 'baseline',
      }}
    >
      <dt style={{ ...eyebrowStyle, fontSize: '10px' }}>{term}</dt>
      <dd style={{ margin: 0, color: 'var(--fg)', wordBreak: 'break-all' }}>{children}</dd>
    </div>
  );
}

export function EventDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';

  const { data: bootstrap } = useQuery<BootstrapState>({
    queryKey: ['bootstrap'],
    queryFn: () => api.getBootstrap(),
  });
  const explorer =
    bootstrap?.chain === 'base' ? 'https://basescan.org' : 'https://sepolia.basescan.org';

  const { data, isLoading, isError, error, refetch } = useQuery<ActivityEventRow>({
    queryKey: ['activity-events', 'detail', id],
    queryFn: () => api.getActivityEvent(id),
    enabled: id.length > 0,
  });

  const meta = data ? eventKindMeta(data.kind) : null;

  return (
    <main
      data-testid="event-detail"
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
          {meta ? meta.label : 'Event'}
        </h1>
        <Link
          href="/events"
          data-testid="event-detail-back"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--accent-sky)',
            textDecoration: 'none',
          }}
        >
          ← Events
        </Link>
      </header>

      {isLoading && (
        <p
          data-testid="event-detail-loading"
          style={{ margin: 0, color: 'var(--fg-muted)', fontSize: '12px' }}
        >
          Loading…
        </p>
      )}

      {isError && (
        <div
          role="alert"
          data-testid="event-detail-error"
          style={{
            border: '1px solid var(--break-red)',
            borderRadius: '6px',
            padding: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <span style={{ color: 'var(--break-red)', fontSize: '12px' }}>
            {(error as { status?: number } | null)?.status === 404
              ? 'This event could not be found.'
              : error instanceof Error
                ? error.message
                : 'Failed to load this event.'}
          </span>
          <button
            type="button"
            onClick={() => {
              void refetch();
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

      {data && meta && (
        <>
          {/* What it did — plain-language summary */}
          <section data-testid="event-detail-summary" style={cardStyle}>
            <span style={eyebrowStyle}>Summary</span>
            <p style={{ margin: 0, color: 'var(--fg)', fontSize: '14px', lineHeight: 1.5 }}>
              {meta.description}
            </p>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '12px' }}>
              <span>
                <span style={{ color: 'var(--fg-muted)' }}>Outcome: </span>
                <span
                  style={{
                    color: eventKindColor(data.kind, data.outcome),
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  {data.outcome ?? '—'}
                </span>
              </span>
              <span>
                <span style={{ color: 'var(--fg-muted)' }}>When: </span>
                <span style={{ color: 'var(--fg)' }}>{formatTimestamp(data.ts)}</span>
              </span>
            </div>
          </section>

          {/* Structured payload */}
          <section data-testid="event-detail-payload" style={cardStyle}>
            <span style={eyebrowStyle}>Details</span>
            <dl style={{ margin: 0 }}>
              <DefRow term="Event id">{data.id}</DefRow>
              <DefRow term="Kind">{data.kind}</DefRow>
              <DefRow term="Request id">{data.requestId ?? '—'}</DefRow>
              <DefRow term="Service index">
                {data.serviceIndex !== null ? data.serviceIndex : '—'}
              </DefRow>
              <DefRow term="Solver type">{data.solverType ?? '—'}</DefRow>
              <DefRow term="Transaction">
                {data.txHash ? (
                  <a
                    data-testid="event-detail-tx-link"
                    href={`${explorer}/tx/${data.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent-gold)', textDecoration: 'none' }}
                  >
                    {data.txHash}
                  </a>
                ) : (
                  '—'
                )}
              </DefRow>
              <DefRow term="Detail">{data.detail ?? '—'}</DefRow>
            </dl>
          </section>
        </>
      )}
    </main>
  );
}
