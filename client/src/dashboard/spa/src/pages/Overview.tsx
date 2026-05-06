import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { HeroStats } from './overview/HeroStats.js';
import { AlertBand } from './overview/AlertBand.js';
import { NetworkCard } from './overview/NetworkCard.js';
import { OperatorCard, type OperatorCardRole } from './overview/OperatorCard.js';
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
        roles?: Array<'solving' | 'evaluating'>;
      };
    };
    operatorError?: string;
    totals?: { observedTasks?: number; activeTaskRuns?: number; solutions?: number; verdicts?: number; failed?: number };
  };
}

/**
 * The operator's joined SolverNets per spec §12. Tasks 21/22 finish the
 * migration from the legacy short-name-keyed `solverNets` shape to the
 * `manifestCid`-keyed shape; until then, OperatorCard accepts both.
 *
 * New shape:    { '<manifestCid>': { name, manifestCid, roles: ['solver'|'evaluator'], harness?, ... } }
 * Legacy shape: { '<shortName>':   { enabled: boolean, roles?: ['solving'|'evaluating'], ... } }
 */
interface BootstrapWithSolverNets {
  solverNets?: Record<
    string,
    {
      name?: string;
      manifestCid?: string;
      enabled?: boolean;
      roles?: string[];
    }
  >;
}

interface JoinedSolverNet {
  /** Display name for the OperatorCard. */
  name: string;
  /** Roles narrowed to OperatorCard's `solving` / `evaluating` vocabulary. */
  roles: OperatorCardRole[];
}

/**
 * Detect whether the operator has joined any SolverNet. Returns the first
 * joined entry projected into OperatorCard's prop shape. The new
 * manifestCid-keyed shape (any entry with non-empty `roles`) wins over the
 * legacy `enabled` flag; both are accepted during the Tasks 21/22 migration
 * (spec §12). The predictionV1 status payload is a final-fallback signal
 * for daemons that haven't been restarted since this migration landed.
 */
function detectJoinedSolverNet(
  bootstrapSolverNets: BootstrapWithSolverNets['solverNets'] | undefined,
  predictionEnabled: boolean,
  predictionRoles: Array<'solving' | 'evaluating'> | undefined,
): JoinedSolverNet | null {
  if (bootstrapSolverNets) {
    // Pass 1: new shape — entries keyed by manifestCid (heuristic: starts
    // with 'baf' / 'Qm', or has a `manifestCid` field) with non-empty roles.
    for (const [key, entry] of Object.entries(bootstrapSolverNets)) {
      if (!entry || typeof entry !== 'object') continue;
      const looksLikeCid =
        entry.manifestCid !== undefined ||
        key.startsWith('baf') ||
        key.startsWith('Qm');
      if (!looksLikeCid) continue;
      const rawRoles = Array.isArray(entry.roles) ? entry.roles : [];
      if (rawRoles.length === 0) continue;
      const roles = mapRolesToOperatorVocab(rawRoles);
      return {
        name: entry.name ?? key,
        roles: roles.length > 0 ? roles : ['solving'],
      };
    }
    // Pass 2: legacy short-name shape — any entry with `enabled: true`.
    for (const [key, entry] of Object.entries(bootstrapSolverNets)) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.enabled !== true) continue;
      const rawRoles = Array.isArray(entry.roles) ? entry.roles : [];
      const roles = mapRolesToOperatorVocab(rawRoles);
      return {
        name: entry.name ?? key,
        roles: roles.length > 0 ? roles : ['solving'],
      };
    }
  }

  // Pass 3: predictionV1 status payload as a last-resort signal. The daemon
  // surfaces this for back-compat with the pre-spec-§12 single-net world.
  if (predictionEnabled) {
    return {
      name: 'prediction',
      roles: predictionRoles ?? ['solving'],
    };
  }
  return null;
}

function mapRolesToOperatorVocab(roles: string[]): OperatorCardRole[] {
  const mapped: OperatorCardRole[] = [];
  for (const r of roles) {
    if (r === 'solving' || r === 'solver') {
      if (!mapped.includes('solving')) mapped.push('solving');
    } else if (r === 'evaluating' || r === 'evaluator') {
      if (!mapped.includes('evaluating')) mapped.push('evaluating');
    }
  }
  return mapped;
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

export function OverviewPage(): JSX.Element {
  const { data: status } = useQuery<OverviewStatusV1>({
    queryKey: ['status'],
    queryFn: () => api.getStatus() as Promise<OverviewStatusV1>,
    refetchInterval: 5_000,
  });
  const { data: bootstrap } = useQuery<BootstrapWithSolverNets>({
    queryKey: ['bootstrap'],
    queryFn: () => api.getBootstrap() as Promise<BootstrapWithSolverNets>,
    refetchInterval: 30_000,
  });

  const operator = status?.predictionV1?.operator;
  // Spec §12: surface the operator's joined SolverNets from the
  // `solverNets[manifestCid]` config block. Until Task 22 retires the
  // legacy short-name-keyed shape, we accept both shapes in
  // `detectJoinedSolverNet`. Falling back to the predictionV1 status payload
  // covers the current Phase-1 single-net world where the daemon writes
  // `solverNets.prediction.enabled` rather than a manifestCid entry.
  const joined = detectJoinedSolverNet(
    bootstrap?.solverNets,
    operator?.solverNet?.enabled === true,
    operator?.solverNet?.roles,
  );
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
       * Spec §12: the OperatorCard surfaces the operator's joined SolverNet
       * from `bootstrap.solverNets`. The empty state ("Pick a SolverNet")
       * deep-links to `/configuration#solvernets` where the registry catalog
       * is rendered. `detectJoinedSolverNet` accepts the legacy short-name
       * shape and the new manifestCid-keyed shape during the Tasks 21/22
       * migration window.
       */}
      {joined ? (
        <OperatorCard
          name={joined.name}
          roles={joined.roles}
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
