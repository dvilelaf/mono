import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { EmptyState } from './launcher/EmptyState.js';
import { SetupFlow } from './launcher/SetupFlow.js';
import { KnowledgeProductionCard } from './launcher/KnowledgeProductionCard.js';
import { CostCard } from './launcher/CostCard.js';
import { GeneratorStatusCard } from './launcher/GeneratorStatusCard.js';
import { PostedTasksList } from './launcher/PostedTasksList.js';
import { EmissionsPlaceholder } from './launcher/EmissionsPlaceholder.js';

/**
 * Launcher mode overview page — composes Tasks 12-15's components per
 * spec/2026-05-05-launcher-role-and-mode.md §6.4 + §6.5.
 *
 * - No SolverNet has 'launching' role -> EmptyState (with CTA to setup).
 * - CTA clicked -> SetupFlow wizard (4 steps; flips 'launching' on via PATCH).
 * - At least one launching SolverNet -> tier 1-4 stack:
 *     1. KnowledgeProductionCard (intent + scoreboard + recent settled)
 *     2. CostCard (7d burn + funded + open-budget reservations)
 *     3. GeneratorStatusCard + PostedTasksList (tactical state)
 *     4. EmissionsPlaceholder (Phase B+ ve-JINN gauge)
 */

const PREDICTION_INTENT = 'Calibrated probabilistic forecasts of Polymarket-listed events';

const DEFAULT_GENERATOR_DEFAULTS = {
  cadenceMs: 21_600_000,
  maxNewRoundsPerPoll: 5,
  maxNewRoundsPerDay: 100,
  maxOpenRounds: 250,
};

export function LauncherPage(): JSX.Element {
  const qc = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ['launcher-status'],
    queryFn: () => api.fetchLauncherStatus(),
    refetchInterval: 30_000,
  });
  const { data: tasks } = useQuery({
    queryKey: ['launcher-tasks'],
    queryFn: () => api.fetchLauncherTasks(),
  });
  const [setupOpen, setSetupOpen] = useState(false);

  if (!status) {
    return <div style={{ padding: 24, color: 'var(--fg-muted)' }}>Loading…</div>;
  }

  if (setupOpen) {
    return (
      <div style={{ padding: '24px' }}>
        <SetupFlow
          netName="prediction"
          defaults={DEFAULT_GENERATOR_DEFAULTS}
          safeBalanceWei={status.nets[0]?.budget?.safeBalanceWei ?? '0'}
          onPatch={(name, patch) => api.patchLauncherSolverNet(name, patch)}
          onComplete={() => {
            setSetupOpen(false);
            qc.invalidateQueries({ queryKey: ['launcher-status'] });
            qc.invalidateQueries({ queryKey: ['launcher-tasks'] });
          }}
        />
      </div>
    );
  }

  if (status.nets.length === 0) {
    return (
      <div style={{ padding: '24px' }}>
        <EmptyState onLaunch={() => setSetupOpen(true)} />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {status.nets.map((net) => (
        <Fragment key={net.name}>
          <KnowledgeProductionCard
            netName={net.name}
            intent={net.name === 'prediction' ? PREDICTION_INTENT : net.name}
            // TODO(jinn-mono-l2zl.16.X): wire actual Brier scoreboard endpoint.
            // Data path exists in client/src/corpus/prediction-brier-scoreboard.ts
            // but is not exposed via HTTP to the SPA yet.
            scoreboard={undefined}
            recentSettled={[]}
          />
          <CostCard
            // TODO(jinn-mono-l2zl.16.X): derive 7d burn from settled tasks.
            burn7dWei="0"
            tasksFunded7d={net.openTasks}
            openTaskBudgetWei={net.budget.reservedBudgetWei}
          />
          <GeneratorStatusCard status={net.generator} />
          <PostedTasksList
            tasks={(tasks?.tasks ?? []).filter((t) => t.solverNet === net.name)}
            onLoadMore={() => qc.invalidateQueries({ queryKey: ['launcher-tasks'] })}
          />
          <EmissionsPlaceholder />
        </Fragment>
      ))}
    </div>
  );
}
