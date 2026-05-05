import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import {
  GeneratorConfigSection,
  type GeneratorConfig,
} from './launcher/GeneratorConfigSection.js';

/**
 * Launcher mode > /launcher/configuration. Per-SolverNet generator config
 * editor.
 *
 * Renders one `GeneratorConfigSection` per SolverNet whose `roles` includes
 * `'launching'` (mirrored from the daemon's `/v1/launcher/status` response).
 *
 * Edits hot-apply per spec §5.2 — there is no daemon-restart pill on this
 * page. After a successful PATCH the launcher status query is invalidated
 * so the rest of Launcher mode picks up the new cadence/window.
 *
 * KNOWN GAP: the form starts from `PREDICTION_DEFAULTS` rather than the
 * operator's currently-resolved generator config because no endpoint
 * surfaces those values to the SPA today. Tracked in the bd issue filed
 * with Task 17 — extend `/v1/launcher/status` (or add
 * `/v1/launcher/config/:net`) so the form pre-fills with the persisted
 * values.
 */

const PREDICTION_DEFAULTS: GeneratorConfig = {
  cadenceMs: 21_600_000,
  maxNewRoundsPerPoll: 5,
  maxNewRoundsPerDay: 100,
  maxOpenRounds: 250,
  allowlistConditionIds: [],
  blocklistConditionIds: [],
  windowMs: 86_400_000,
  resolveGapMs: 3_600_000,
};

export function LauncherConfigurationPage(): JSX.Element {
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ['launcher-status'],
    queryFn: () => api.fetchLauncherStatus(),
  });

  const launchingNets = status?.nets ?? [];

  return (
    <div
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontFamily: "'JetBrains Mono', monospace",
        color: 'var(--fg)',
      }}
    >
      <h1
        style={{
          fontFamily: "'Instrument Serif', 'Times New Roman', serif",
          fontSize: '32px',
          margin: '0 0 4px',
          color: 'var(--fg)',
          fontWeight: 400,
        }}
      >
        Generator config
      </h1>
      <p style={{ color: 'var(--fg-muted)', fontSize: '13px', margin: 0 }}>
        Edits hot-apply within one cadence — no daemon restart required.
      </p>
      {isLoading || !status ? (
        <p style={{ color: 'var(--fg-muted)', fontSize: '13px' }}>Loading…</p>
      ) : launchingNets.length === 0 ? (
        <p style={{ color: 'var(--fg-muted)', fontSize: '13px' }}>
          No launching SolverNets — go to{' '}
          <a href="/launcher" style={{ color: 'var(--accent-sky)' }}>
            Launcher
          </a>{' '}
          first to enable a SolverNet for launching.
        </p>
      ) : (
        launchingNets.map((net) => (
          <GeneratorConfigSection
            key={net.name}
            netName={net.name}
            config={PREDICTION_DEFAULTS}
            onSave={async ({ generator }) => {
              await api.patchLauncherSolverNet(net.name, { generator });
              qc.invalidateQueries({ queryKey: ['launcher-status'] });
            }}
          />
        ))
      )}
    </div>
  );
}
