import { SectionCard } from '../../components/SectionCard.js';

/**
 * Tier-3 Launcher overview card — tactical generator state. Surfaces
 * the generator's run state (active / paused / errored), the most
 * recent poll's timestamp + summary, and an alert banner when the
 * generator has errored or its last poll is older than expected
 * (`status.stale` is set server-side when `lastPollAt + 2*cadence < now`).
 *
 * Presentation only. Task 16 wires real data from the daemon's
 * `LauncherStatusGeneratorView`; here we just take props.
 */

export interface GeneratorStatus {
  state: 'active' | 'paused' | 'errored';
  lastPollAt?: string;
  lastPollSummary?: { evaluated: number; posted: number; skipped: number };
  lastError?: { message: string; at: string };
  cadenceMs: number;
  stale?: boolean;
}

export interface GeneratorStatusCardProps {
  status: GeneratorStatus;
}

const STATE_COLORS: Record<GeneratorStatus['state'], string> = {
  active: 'var(--vow-green)',
  paused: 'var(--fg-muted)',
  errored: 'var(--break-red)',
};

const STATE_LABELS: Record<GeneratorStatus['state'], string> = {
  active: 'Active',
  paused: 'Paused',
  errored: 'Errored',
};

const STATE_TONES: Record<GeneratorStatus['state'], 'live' | 'default' | 'danger'> = {
  active: 'live',
  paused: 'default',
  errored: 'danger',
};

export function GeneratorStatusCard({ status }: GeneratorStatusCardProps): JSX.Element {
  const color = STATE_COLORS[status.state];
  const label = STATE_LABELS[status.state];
  // Errored state takes precedence; stale alert only shows if not already errored.
  const showStaleAlert = status.stale === true && status.state !== 'errored';
  const cadenceMin = Math.round(status.cadenceMs / 60_000);

  return (
    <SectionCard
      title="Generator status"
      summary={label}
      metaChip={{ label, tone: STATE_TONES[status.state] }}
      defaultExpanded
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: color,
          }}
          aria-hidden="true"
        />
        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--fg)', fontSize: '14px' }}>
          {label}
        </span>
      </div>

      {status.lastPollAt && (
        <p
          style={{
            color: 'var(--fg-muted)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '13px',
            margin: 0,
          }}
        >
          last poll: {status.lastPollAt}
        </p>
      )}

      {status.lastPollSummary && (
        <p
          style={{
            color: 'var(--fg)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '13px',
            margin: 0,
          }}
        >
          {status.lastPollSummary.evaluated} evaluated · {status.lastPollSummary.posted} posted ·{' '}
          {status.lastPollSummary.skipped} skipped
        </p>
      )}

      {status.state === 'errored' && status.lastError && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            border: '1px solid var(--break-red)',
            borderRadius: '6px',
            color: 'var(--break-red)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '13px',
          }}
        >
          {status.lastError.message}
          <span style={{ color: 'var(--fg-dim)', fontSize: '11px', marginLeft: '8px' }}>
            at {status.lastError.at}
          </span>
        </div>
      )}

      {showStaleAlert && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            border: '1px solid var(--break-red)',
            borderRadius: '6px',
            color: 'var(--break-red)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '13px',
          }}
        >
          Generator may be stuck — last poll older than expected (cadence {cadenceMin} min).
        </div>
      )}
    </SectionCard>
  );
}
