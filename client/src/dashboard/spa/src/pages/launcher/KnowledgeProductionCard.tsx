import { SectionCard } from '../../components/SectionCard.js';

/**
 * Tier-1 Launcher overview card — "what knowledge is this SolverNet
 * producing." Surfaces the SolverNet's intent line, a Brier-spread
 * headline (vs Polymarket consensus, rolling window) and the most
 * recent settled forecasts.
 *
 * Presentation only. Task 16 wires real data from the Brier scoreboard
 * (`client/src/corpus/prediction-brier-scoreboard.ts`) and the settled
 * Verdicts feed; here we just take props.
 */

export interface RecentSettledForecast {
  taskId: string;
  predicate: string;
  outcome: 'YES' | 'NO' | 'INVALID';
  settledAt: string;
  forecastProb: number;
}

export interface KnowledgeProductionCardProps {
  netName: string;
  intent: string;
  scoreboard?: { brierSpread: number; windowDays: number };
  recentSettled: RecentSettledForecast[];
}

const OUTCOME_COLOR: Record<RecentSettledForecast['outcome'], string> = {
  YES: 'var(--vow-green)',
  NO: 'var(--break-red)',
  INVALID: 'var(--fg-dim)',
};

export function KnowledgeProductionCard({
  netName,
  intent,
  scoreboard,
  recentSettled,
}: KnowledgeProductionCardProps): JSX.Element {
  const brierLine = scoreboard
    ? `Brier spread vs Polymarket consensus (${scoreboard.windowDays}d): ${scoreboard.brierSpread > 0 ? '+' : ''}${scoreboard.brierSpread.toFixed(4)}`
    : 'Brier spread: pending — first settled forecasts not yet observed.';

  return (
    <SectionCard
      title={`${netName} · what knowledge is this SolverNet producing`}
      summary="Intent, calibration, and recent settled forecasts."
      defaultExpanded
    >
      <p style={{ color: 'var(--fg-muted)', margin: '0 0 12px', lineHeight: 1.5, fontSize: '14px' }}>
        {intent}
      </p>
      <p
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--fg)',
          margin: '0 0 16px',
          fontSize: '14px',
        }}
      >
        {brierLine}
      </p>
      {recentSettled.length === 0 ? (
        <p style={{ color: 'var(--fg-dim)', margin: 0, fontSize: '13px' }}>
          No forecasts settled yet. The first round will appear here once it resolves.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {recentSettled.map((f) => (
            <li
              key={f.taskId}
              data-testid="recent-settled-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: '12px',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid var(--border)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '13px',
              }}
            >
              <span style={{ color: 'var(--fg)' }}>{f.predicate}</span>
              <span style={{ color: 'var(--fg-muted)' }}>{(f.forecastProb * 100).toFixed(0)}%</span>
              <span
                style={{
                  color: OUTCOME_COLOR[f.outcome],
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                }}
              >
                {f.outcome}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
