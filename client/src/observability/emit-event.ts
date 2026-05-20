import type { Store } from '../store/store.js';

/**
 * The complete set of lifecycle event kinds persisted to the `activity_events`
 * table. Exported as a runtime array so HTTP route validation (and SPA parity
 * tests) can reference a single source of truth — see
 * `src/api/activity-events-endpoint.ts` and the SPA's `lib/event-kinds.ts`.
 */
export const ALLOWED_LIFECYCLE_KINDS = [
  'task_posted',
  'intent_registry_failed',
  'request_claimed',
  'delivery_submitted',
  'evaluation_submitted',
  'reward_claimed',
  'balance_topup',
  'jinn_claim_emitted',
  'jinn_claim_submitted',
  'jinn_claim_canonical_skip',
  'engine_transition',
  'tick_error',
  'startup',
  'shutdown',
] as const;

export type LifecycleKind = (typeof ALLOWED_LIFECYCLE_KINDS)[number];

export interface LifecycleEvent {
  kind: LifecycleKind;
  requestId?: string;
  serviceIndex?: number;
  txHash?: string;
  solverType?: string;
  outcome?: 'ok' | 'failed' | 'warn';
  detail?: string;
}

export function emitEvent(
  store: Store,
  event: LifecycleEvent,
  component = 'lifecycle',
): void {
  const ts = new Date().toISOString();
  store.recordActivityEvent({
    ts,
    kind: event.kind,
    requestId: event.requestId ?? null,
    serviceIndex: event.serviceIndex ?? null,
    txHash: event.txHash ?? null,
    solverType: event.solverType ?? null,
    outcome: event.outcome ?? null,
    detail: event.detail ?? null,
  });

  const payload = {
    ts,
    level: event.outcome === 'failed' ? 'error' : event.outcome === 'warn' ? 'warn' : 'info',
    component,
    msg: event.detail ?? event.kind,
    requestId: event.requestId ?? null,
    txHash: event.txHash ?? null,
    serviceIndex: event.serviceIndex ?? null,
    solverType: event.solverType ?? null,
    outcome: event.outcome ?? 'ok',
    kind: event.kind,
  };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
}
