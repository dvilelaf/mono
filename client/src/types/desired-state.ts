/**
 * Runtime shape of a Task — wraps SignedIntentV1 (see ./intent.ts) plus
 * runtime fields (attempt number, role, etc.).
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { WindowSchema, type Window } from './window.js';
import { SignedIntentV1Schema, type SignedIntentV1 } from './intent.js';

export type RequestId = string;

// ── Window (re-exported for backwards compat) ─────────────────────────────────
export { WindowSchema, type Window };

// ── Task schema ─────────────────────────────────────────────────────

export const TaskSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1).optional(),
  context: z.record(z.unknown()).optional(),
  solverType: z.string().optional(),
  role: z.enum(['restoration', 'evaluation']).optional(),
  attemptId: z.string().optional(),
  attemptNumber: z.number().int().optional(),
  restorationRequestId: z.string().optional(),

  // §3 — optional lifecycle window
  window: WindowSchema.optional(),

  // §3 — typed task payload; dispatcher is top-level `solverType`.
  spec: z.record(z.unknown()).optional(),

  // §3 — pre-claim and post-hoc qualifying rules; shape governed by solverType
  eligibility: z.record(z.unknown()).optional(),

  // §4 — optional typed signed intent; loose fields hydrate from this when absent
  intent: SignedIntentV1Schema.optional(),
});

export interface Task {
  id: string;
  description: string;
  context?: Record<string, unknown>;
  solverType?: string;
  role?: 'restoration' | 'evaluation';
  attemptId?: string;
  attemptNumber?: number;
  restorationRequestId?: string;

  // §3 extensions (all optional for backwards compat)
  window?: Window;
  spec?: Record<string, unknown>;
  eligibility?: Record<string, unknown>;

  // §4 — typed signed intent (Plan C will migrate consumers to read this directly)
  intent?: SignedIntentV1;
}

export function parseTask(input: unknown): Task {
  const parsed = TaskSchema.parse(input);
  const intent = parsed.intent;
  const description = parsed.description ?? intent?.description;
  if (!description) {
    throw new Error('Task requires description (loose field or intent.description)');
  }
  const intentSpec = intent?.spec as ({ kind?: string } & Record<string, unknown>) | undefined;
  const parsedSpec = parsed.spec as ({ kind?: string } & Record<string, unknown>) | undefined;
  const solverType = parsed.solverType ?? parsedSpec?.kind ?? intentSpec?.kind;
  const stripLegacyKind = (spec: ({ kind?: string } & Record<string, unknown>) | undefined) =>
    spec ? Object.fromEntries(Object.entries(spec).filter(([key]) => key !== 'kind')) : undefined;
  const spec =
    stripLegacyKind(parsedSpec) ??
    stripLegacyKind(intentSpec);
  return {
    id: parsed.id ?? intent?.id ?? randomUUID(),
    description,
    context: parsed.context,
    solverType,
    role: parsed.role,
    attemptId: parsed.attemptId,
    attemptNumber: parsed.attemptNumber,
    restorationRequestId: parsed.restorationRequestId,
    window: parsed.window ?? intent?.window,
    spec,
    eligibility: parsed.eligibility ?? intent?.eligibility,
    intent,
  };
}

export interface TaskRequest {
  requestId: RequestId;
  task: Task;
  payment?: string;
  timeout?: number;

  // On-chain provenance from the RestorationJobCreated / MarketplaceRequest event
  taskCid?: string;                 // IPFS CID of the Task payload
  onchainCreationTx?: `0x${string}`; // tx hash of JinnRouter.createRestorationJob
  onchainCreationBlock?: number;      // block number containing the tx
}

export interface TaskResult {
  data: string;
  artifacts?: string[];
}

export interface DeliveredResult {
  requestId: RequestId;
  task: Task;
  result: TaskResult;
  deliveryMechAddress: string;
}
