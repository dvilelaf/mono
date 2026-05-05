import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { HeroStats } from './overview/HeroStats.js';
import { AlertBand } from './overview/AlertBand.js';
import { NetworkCard } from './overview/NetworkCard.js';
import { OperatorCard } from './overview/OperatorCard.js';
import { RecentActivity } from './overview/RecentActivity.js';
import { QuickActions } from './overview/QuickActions.js';
import { IdentityCard, type ServiceIdentity } from './overview/IdentityCard.js';
import { AdvancedDetails } from './overview/AdvancedDetails.js';

interface OverviewStatusV1 {
  fleet?: {
    services?: Array<{
      index: number;
      step: string;
      safeAddress?: string | null;
      agentId?: number | null;
      safeBoundToAgent?: boolean;
    }>;
  };
  rewards?: {
    pendingStakingRewardsWei?: string;
  };
  masterGas?: {
    balanceWei?: string;
    runwayDaysExcess?: string | number | null;
  };
  predictionV1?: {
    /**
     * Mirror of the daemon-side `PredictionOperatorStatus`. Only a subset
     * of fields is consumed here, but the field names must match the
     * actual server payload — earlier copies of this interface invented
     * a top-level `enabled` and `role` that don't exist, which silently
     * left Overview's gating reading a non-existent field.
     * See `client/src/solver-nets/prediction-operator-ux.ts`.
     */
    operator?: {
      ok?: boolean;
      enabled?: boolean;
      nextAction?: { description?: string };
      diagnostics?: Array<{ code: string; severity: string; message: string; configField?: string }>;
      solverNet?: {
        name?: string;
        enabled?: boolean;
        roles?: string[];
      };
    };
    operatorError?: string;
    totals?: { observedTasks?: number; activeTaskRuns?: number; solutions?: number; verdicts?: number; failed?: number };
  };
}

function formatEth(wei?: string): string {
  if (!wei || !/^\d+$/.test(wei)) return '—';
  try {
    const n = BigInt(wei);
    const eth = Number(n) / 1e18;
    return eth.toFixed(4);
  } catch {
    return '—';
  }
}

function operatorVisibleRoles(roles?: string[]): Array<'solving' | 'evaluating'> {
  return (roles ?? []).filter(
    (role): role is 'solving' | 'evaluating' => role === 'solving' || role === 'evaluating',
  );
}

export function OverviewPage(): JSX.Element {
  const { data: status } = useQuery<OverviewStatusV1>({
    queryKey: ['status'],
    queryFn: () => api.getStatus() as Promise<OverviewStatusV1>,
    refetchInterval: 5_000,
  });

  const operator = status?.predictionV1?.operator;
  const operatorRoles = operatorVisibleRoles(operator?.solverNet?.roles);
  // `roles[]` is the canonical operator participation signal. Launcher mode
  // owns `launching`, so Overview only treats solving/evaluating as visible
  // operator roles and ignores the legacy `solverNet.enabled` flag.
  const operatorParticipating = operatorRoles.length > 0;
  const totals = {
    tasks: status?.predictionV1?.totals?.observedTasks ?? 0,
    active: status?.predictionV1?.totals?.activeTaskRuns ?? 0,
    solutions: status?.predictionV1?.totals?.solutions ?? 0,
    verdicts: status?.predictionV1?.totals?.verdicts ?? 0,
    failed: status?.predictionV1?.totals?.failed ?? 0,
  };
  const firstAttention = (operator?.diagnostics ?? []).find(
    (d) => d.severity === 'error' && d.code !== 'prediction_solvernet_disabled',
  );
  const services: ServiceIdentity[] = (status?.fleet?.services ?? []).map((s) => ({
    index: s.index,
    safeAddress: s.safeAddress ?? '',
    agentId: s.agentId ?? null,
    safeBoundToAgent: s.safeBoundToAgent ?? false,
  }));

  const tasksDelivered = totals.solutions;
  const jinnEarned = formatEth(status?.rewards?.pendingStakingRewardsWei);
  const gasRunwayDays = status?.masterGas?.runwayDaysExcess ?? '—';
  const allOperational = (status?.fleet?.services ?? []).every((s) => s.step === 'complete' || s.step === 'safe_binding_pending');
  const nodeStatus = allOperational ? 'Running' : 'Resuming';

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <HeroStats
        tasksDelivered={tasksDelivered}
        jinnEarned={jinnEarned}
        gasRunwayDays={gasRunwayDays}
        nodeStatus={nodeStatus}
      />

      {firstAttention && (
        <AlertBand
          lead="Needs attention"
          body={firstAttention.message}
          ctaLabel="Configure prediction"
          ctaHref="/configuration#solvernets/prediction"
        />
      )}

      {/* Public counters — always shown when the catalog has prediction. */}
      <NetworkCard name="prediction" totals={totals} />

      {/*
       * Operator-side state vs. empty-state — strictly mutually exclusive.
       * Show OperatorCard whenever the operator has solving/evaluating roles;
       * show the "Pick a SolverNet" prompt only when no operator-visible role
       * is active.
       */}
      {operatorParticipating ? (
        <OperatorCard
          name={operator?.solverNet?.name ?? 'prediction'}
          roles={operatorRoles}
          state="live"
          waitingMessage={operator?.nextAction?.description}
        />
      ) : (
        <AlertBand
          lead="Get started"
          body="Pick a SolverNet to participate in"
          ctaLabel="Configure"
          ctaHref="/configuration#solvernets"
        />
      )}

      <RecentActivity events={[]} />
      <QuickActions
        claimableJinn={formatEth(status?.rewards?.pendingStakingRewardsWei)}
        gasEth={formatEth(status?.masterGas?.balanceWei)}
        onClaim={() => { void api.claimRewards(); }}
        onTopUp={() => undefined}
        onManage={() => undefined}
        onRestart={() => { void api.restartDaemon(); }}
      />
      <IdentityCard
        agentId={services[0]?.agentId ?? null}
        chain="Base Sepolia"
        safeAddress={services[0]?.safeAddress ?? null}
        services={services}
      />
      <AdvancedDetails />
    </div>
  );
}
