export type StructuredEventKind = 'intent' | 'reward' | 'fleet' | 'system' | 'error' | 'log';

export interface StructuredEvent {
  schemaVersion: 1;
  id: string;
  ts: string;
  kind: StructuredEventKind;
  message: string;
  requestId?: string;
  txHash?: string;
  errorCode?: string;
  details?: Record<string, unknown>;
}

export type DaemonMode = 'setup' | 'running' | 'uninitialized';

export interface BootstrapErrorEnvelope {
  schemaVersion: 1;
  generatedAt: string;
  code: 'funding_required' | 'invalid_invocation' | 'bootstrap_incomplete' | 'reconcile_needed' | 'transient_error' | 'fatal';
  exitCode: number;
  message: string;
  hint?: string;
  exampleCli?: string;
  details?: Record<string, unknown>;
}

export interface BootstrapState {
  schemaVersion: 1;
  mode: DaemonMode;
  steps: string[];
  currentStep: string;
  services: Array<{
    index: number;
    step: string;
    safe_address?: string;
    service_id?: number;
  }>;
  master_address?: string;
  chain?: string;
  funding?: {
    master_address?: string;
    eth_required?: string;
    eth_balance?: string;
    targetWei?: string;
  };
  /** Persisted from the last fatal bootstrap exit. Absent on healthy state. */
  error?: BootstrapErrorEnvelope;
}

export interface ClaudeAuthState {
  schemaVersion: 1;
  authenticated: boolean;
  context: 'bare' | 'docker-compose' | 'container';
  detail: string;
  binary: {
    ok: boolean;
    detail: string;
    resolvedPath?: string;
  };
  email?: string;
}

export interface SolverNetCatalogEntry {
  name: string;
  description: string;
  state: 'live' | 'available' | 'coming_soon';
  intrinsicSolverType: string;
  supportedRoles: ('solving' | 'evaluating')[];
  compatibleHarnesses: Array<{
    name: string;
    version: string;
    supportsRoles: ('solving' | 'evaluating')[];
  }>;
  compatiblePlugins: Array<{ name: string; version: string; source: string }>;
}

export interface SolverNetsCatalogResponse {
  schemaVersion: 1;
  generatedAt: string;
  nets: SolverNetCatalogEntry[];
}

/**
 * Mirror of the daemon-side `LauncherStatusResponse`
 * (client/src/api/launcher-status.ts). Surfaces per-SolverNet generator state,
 * open-Task counts, and Safe-budget runway for SolverNets whose `roles`
 * includes `'launching'`. Operator mode never reads this — the launcher state
 * lives exclusively here (spec/2026-05-05-launcher-role-and-mode.md §6.3).
 */
export interface LauncherStatusGeneratorView {
  state: 'active' | 'paused' | 'errored';
  lastPollAt?: string;
  lastPollSummary?: {
    evaluated: number;
    posted: number;
    skipped: number;
  };
  lastError?: { message: string; at: string };
  cadenceMs: number;
  stale: boolean;
}

export interface LauncherStatusBudgetView {
  safeAddress: string;
  safeBalanceWei: string;
  reservedBudgetWei: string;
  runwayDays?: number;
}

export interface LauncherStatusNetEntry {
  name: string;
  generator: LauncherStatusGeneratorView;
  openTasks: number;
  budget: LauncherStatusBudgetView;
}

export interface LauncherStatusResponse {
  schemaVersion: 1;
  generatedAt: string;
  nets: LauncherStatusNetEntry[];
}

/**
 * Mirror of the daemon-side `LauncherTaskState` / `LauncherTaskEntry` /
 * `LauncherTasksResponse` (client/src/api/launcher-tasks.ts). Paginated by
 * `cursor.before` (ISO timestamp); the SPA passes the bare ISO back as the
 * next-page cursor.
 */
export type LauncherTaskState =
  | 'open'
  | 'claims-in-flight'
  | 'fully-claimed'
  | 'settled'
  | 'failed';

export interface LauncherTaskEntry {
  taskId: string;
  taskCid: string;
  solverNet: string;
  postedAt: string;
  state: LauncherTaskState;
  claims: { current: number; max: number };
  budget: { totalWei: string; remainingWei: string; reclaimableAt?: string };
  summary?: { title?: string; resolutionTime?: string };
}

export interface LauncherTasksResponse {
  schemaVersion: 1;
  generatedAt: string;
  cursor?: { before: string };
  tasks: LauncherTaskEntry[];
}

/**
 * Body shape for `PATCH /v1/launcher/solvernets/:name`. Owns the `'launching'`
 * role flip and the top-level `predictionV1*` generator-config keys. Operator
 * mode owns `'solving'` / `'evaluating'` via `POST /v1/setup/solvernets/:name`
 * — strict separation per spec §3.
 *
 * Generator-config keys here mirror the daemon-side `mapGeneratorPatch` table
 * in `client/src/api/launcher-endpoints.ts`; keep in sync with the
 * `predictionV1*` fields in `JinnConfigSchema`.
 */
export interface LauncherSolverNetPatch {
  launching?: boolean;
  generator?: {
    cadenceMs?: number;
    maxNewRoundsPerPoll?: number;
    maxNewRoundsPerDay?: number;
    maxOpenRounds?: number;
    allowlistConditionIds?: string[];
    blocklistConditionIds?: string[];
    windowMs?: number;
    resolveGapMs?: number;
  };
}

export interface LauncherSolverNetPatchResponse {
  ok: true;
  name: string;
  roles: string[];
  generator: Record<string, unknown>;
}
