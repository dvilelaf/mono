import { SectionCard } from '../../components/SectionCard.js';

/**
 * Tier 2 launcher card: shows 7-day cost summary — burn rate, Tasks funded,
 * and open-task budget reservations. Pure presentation; data comes from
 * `api.fetchLauncherSummary()` (wired in Task 16).
 *
 * NOTE: `formatEth` is duplicated 3x in the SPA (Overview.tsx,
 * AwaitingFundingCard.tsx, SetupFlow.tsx). Dedup tracked as
 * `jinn-mono-l2zl.16`.
 */

export interface CostCardProps {
  burn7dWei: string;
  tasksFunded7d: number;
  openTaskBudgetWei: string;
}

function formatEth(wei: string): string {
  const num = Number(BigInt(wei) / 10n ** 14n) / 10_000;
  return num.toFixed(4);
}

export function CostCard({
  burn7dWei,
  tasksFunded7d,
  openTaskBudgetWei,
}: CostCardProps): JSX.Element {
  return (
    <SectionCard
      title="Cost of producing this knowledge"
      summary="7-day window"
      defaultExpanded
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <Stat label="Burn (7d)" value={`${formatEth(burn7dWei)} ETH`} />
        <Stat label="Tasks funded (7d)" value={String(tasksFunded7d)} />
        <Stat label="Open-budget reserved" value={`${formatEth(openTaskBudgetWei)} ETH`} />
      </div>
    </SectionCard>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'var(--fg-muted)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '20px',
          color: 'var(--fg)',
          marginTop: '4px',
        }}
      >
        {value}
      </div>
    </div>
  );
}
