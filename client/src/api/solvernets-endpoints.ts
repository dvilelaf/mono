/**
 * SolverNet creation/launch HTTP routes.
 *
 * Spec: spec/2026-05-05-solvernet-creation-and-launch.md §6.1, §10.
 *
 * Registers under `/v1/solvernets/*`:
 *
 *   Drafts CRUD (Task 13):
 *     POST   /v1/solvernets/drafts              — create a new draft.
 *     GET    /v1/solvernets/drafts              — list owned drafts.
 *     GET    /v1/solvernets/drafts/:id          — load a single draft.
 *     PATCH  /v1/solvernets/drafts/:id          — update fields on a draft.
 *     DELETE /v1/solvernets/drafts/:id          — delete a draft.
 *
 *   Launch + lifecycle (Task 14):
 *     POST   /v1/solvernets/drafts/:id/launch                   — kick off LaunchAction.
 *     GET    /v1/solvernets/launched/:id                        — read current record.
 *     PATCH  /v1/solvernets/launched/:id/lifecycle              — pause/resume/retire.
 *     PATCH  /v1/solvernets/launched/:id/generator-config       — hot-apply config.
 *
 * Auth: route mounting is handled by server.ts (UI-token gate via
 * `requireUiToken`). This module assumes the gate is in place upstream
 * — the same posture as `setup-endpoints.ts` / `launcher-endpoints.ts`.
 *
 * Validation posture: drafts are partial-by-construction. Field-shape
 * validation runs (so we never persist garbage that breaks the loader),
 * but business-rule validation — "price must be set", "openRoles must be
 * non-empty" — runs only at the launch gate (POST /drafts/:id/launch),
 * so an operator can fill out the wizard out-of-order without the API
 * rejecting half-finished drafts.
 *
 * Launch behaviour (Task 14, see also spec §10):
 *
 *   - The endpoint synthesises an `UnsignedSolverNetManifestV1` from the
 *     draft + the configured launcher identity + the contract template
 *     resolved from the SDK's `getSolverNetContract({id, version})`.
 *   - Manifest signing is performed inside `LaunchAction.launch()` via the
 *     pre-signed `signature` stamp; for the API surface we sign right
 *     before invoking the action so the launch starts with a verifiable
 *     manifest.
 *   - The launch is fire-and-forget: we kick off the state machine in the
 *     background and return 202 with a poll URL so the SPA can render
 *     progress without blocking on IPFS pin + tx confirmation. We briefly
 *     wait for the initial record to land on disk (the launch action's
 *     first checkpoint) so the SPA's first poll always finds a record.
 */
import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  getSolverNetContract,
  type SolverNetManifestV1,
} from '@jinn-network/sdk/solvernets';
import {
  DraftSolverNetRecordSchema,
  LaunchedSolverNetRecordSchema,
  type DraftSolverNetRecord,
  type LaunchedSolverNetRecord,
  type SolverNetStore,
} from '../solvernets/store.js';
import {
  signManifest,
  type UnsignedSolverNetManifestV1,
} from '../solvernets/manifest.js';
import { LaunchAction } from '../solvernets/launch-state-machine.js';
import { LifecycleTransition } from '../solvernets/lifecycle-transitions.js';
import type { PendingGeneratorSpawn } from '../solvernets/daemon-init.js';
import type { SignerWithAgentEoa } from '../solvernets/registry-client.js';
import type { PredictionV1GeneratorRuntimeConfig } from '../solver-types/prediction-v1-auto.js';

/**
 * Optional Task-14 deps that turn on the launch + lifecycle + generator-config
 * endpoints. The drafts CRUD endpoints (Task 13) only need `store`; when this
 * block is omitted those routes still mount and the launch routes return 503.
 */
export interface SolverNetsLaunchDeps {
  launchAction: LaunchAction;
  lifecycleTransition: LifecycleTransition;
  /** Live mirror of the daemon's per-record generator state. The endpoint
   * mutates `configRef.current` for the matching record so the next
   * generator tick sees hot-applied config. Lookups by `solverNetId`. */
  pendingGenerators: { current: PendingGeneratorSpawn[] };
  /** Signer used by `launchAction.launch` (single-launcher daemon). */
  signer: SignerWithAgentEoa;
  /** Network embedded in the synthesised manifest's `network` field. */
  network: 'base-sepolia' | 'base';
  /** Launcher identity embedded in the manifest's `launcher` block. */
  launcher: {
    safeAddress: `0x${string}`;
    agentEoa: `0x${string}`;
    agentId: string;
  };
  /** Override `Date.now()` for deterministic timestamps in tests. */
  now?: () => Date;
}

export interface SolverNetsEndpointsDeps {
  store: SolverNetStore;
  /** Optional Task 14 launch + lifecycle + generator-config wiring. */
  launch?: SolverNetsLaunchDeps;
}

// ── Draft CRUD validation schemas ──────────────────────────────────────────

// Zod schema for the editable subset of a draft. Mirrors
// `DraftSolverNetRecordSchema` from the store but drops the
// store-managed fields (`schemaVersion`, `draftId`, `createdAt`,
// `updatedAt`, `completedSteps` is editable by the UI).
//
// All fields are optional — POST with `{}` produces an empty draft, PATCH
// of a single field updates only that field. Wrong types → Zod fails fast,
// the route returns 400 with a structured error.
const DraftEditableSchema = z
  .object({
    templateContractId: z.string().optional(),
    templateContractVersion: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    generatorConfig: z.record(z.string(), z.unknown()).optional(),
    solutionPriceWei: z.string().optional(),
    verdictPriceWei: z.string().optional(),
    openRoles: z.array(z.enum(['solver', 'evaluator'])).optional(),
    completedSteps: z
      .array(z.enum(['define', 'reviewContract', 'configureGenerator', 'configurePricing']))
      .optional(),
  })
  .strict();

type DraftEditable = z.infer<typeof DraftEditableSchema>;

// Fields the API explicitly forbids in a request body. Surfaced here so the
// 400 message can name them rather than relying on `.strict()`'s generic
// "Unrecognized key" wording (which doesn't tell the SPA *why* a field is
// rejected — these are immutable, not just unknown).
const IMMUTABLE_FIELDS = ['draftId', 'createdAt', 'updatedAt', 'schemaVersion'] as const;

function rejectImmutableFields(
  body: unknown,
): { error: string; field: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  for (const f of IMMUTABLE_FIELDS) {
    if (f in (body as Record<string, unknown>)) {
      return { error: `\`${f}\` is immutable and cannot be set via the API`, field: f };
    }
  }
  return null;
}

function applyEditable(
  current: DraftSolverNetRecord,
  patch: DraftEditable,
  now: string,
): DraftSolverNetRecord {
  const next: DraftSolverNetRecord = { ...current, updatedAt: now };
  // Only assign keys that are explicitly present in the patch object so that
  // PATCH `{ name: 'x' }` doesn't clear `description` etc. The Zod schema's
  // `.optional()` would let `undefined` slip through, hence the explicit
  // `key in patch` check below.
  if ('templateContractId' in patch) next.templateContractId = patch.templateContractId;
  if ('templateContractVersion' in patch)
    next.templateContractVersion = patch.templateContractVersion;
  if ('name' in patch) next.name = patch.name;
  if ('description' in patch) next.description = patch.description;
  if ('generatorConfig' in patch) next.generatorConfig = patch.generatorConfig;
  if ('solutionPriceWei' in patch) next.solutionPriceWei = patch.solutionPriceWei;
  if ('verdictPriceWei' in patch) next.verdictPriceWei = patch.verdictPriceWei;
  if ('openRoles' in patch) next.openRoles = patch.openRoles;
  if ('completedSteps' in patch && patch.completedSteps !== undefined) {
    next.completedSteps = patch.completedSteps;
  }
  return next;
}

// ── Lifecycle / generator-config validation schemas ─────────────────────────

const LifecycleBodySchema = z
  .object({
    target: z.enum(['paused', 'launched', 'retired']),
  })
  .strict();

/**
 * Zod schema mirroring `PredictionV1GeneratorRuntimeConfig` from
 * `solver-types/prediction-v1-auto.ts`. Kept narrow on purpose: only fields
 * the operator can hot-apply are accepted. Static-config fields (agent
 * identity, transport URLs) live in the daemon's static-config block and
 * are never mutated through this endpoint.
 *
 * `.strict()` rejects unknown keys so a typo in the SPA surfaces as 400
 * rather than silently dropping the field.
 */
const GeneratorConfigPatchSchema = z
  .object({
    cadenceMs: z.number().int().nonnegative().optional(),
    maxNewRoundsPerPoll: z.number().int().nonnegative().optional(),
    maxNewRoundsPerDay: z.number().int().nonnegative().optional(),
    maxOpenRounds: z.number().int().nonnegative().optional(),
    submissionWindowMs: z.number().int().nonnegative().optional(),
    allowlistConditionIds: z.array(z.string()).optional(),
    blocklistConditionIds: z.array(z.string()).optional(),
    minTimeToResolutionHours: z.number().nonnegative().optional(),
    maxTimeToResolutionHours: z.number().nonnegative().optional(),
    minLiquidityUsd: z.string().optional(),
    minVolume24hUsd: z.string().optional(),
    maxYesSpread: z.string().optional(),
    maxOrderbookAgeSeconds: z.number().int().nonnegative().optional(),
  })
  .strict();

// ── Launch helpers ──────────────────────────────────────────────────────────

interface DraftCompletenessResult {
  ok: boolean;
  missingFields: string[];
}

/**
 * Inspect a draft to determine whether it is launchable. The launch endpoint
 * uses this gate (and the gate alone) to decide whether to proceed; field-
 * shape validation has already happened on every PATCH.
 */
function checkDraftCompleteness(draft: DraftSolverNetRecord): DraftCompletenessResult {
  const missing: string[] = [];
  if (!draft.name || draft.name.trim().length === 0) missing.push('name');
  if (draft.description === undefined || draft.description === null)
    missing.push('description');
  if (!draft.templateContractId) missing.push('templateContractId');
  if (!draft.templateContractVersion) missing.push('templateContractVersion');
  if (!draft.solutionPriceWei) missing.push('solutionPriceWei');
  if (!draft.verdictPriceWei) missing.push('verdictPriceWei');
  if (!draft.openRoles || draft.openRoles.length === 0) missing.push('openRoles');
  return { ok: missing.length === 0, missingFields: missing };
}

/**
 * Build an `UnsignedSolverNetManifestV1` from a launchable draft + the
 * configured launcher identity + the SDK contract template. Caller signs
 * the result and hands it to `LaunchAction.launch`.
 *
 * `solverNetId` is derived from the launcher agentId + a stable suffix
 * derived from the draftId so re-launching the same draft would collide
 * (idempotency) — but because we delete drafts post-launch, in practice each
 * draft launches once and the id is unique.
 */
function buildUnsignedManifest(args: {
  draft: DraftSolverNetRecord;
  launcher: SolverNetsLaunchDeps['launcher'];
  network: SolverNetsLaunchDeps['network'];
  now: () => Date;
}): { ok: true; manifest: UnsignedSolverNetManifestV1 } | { ok: false; error: string } {
  const { draft, launcher, network, now } = args;
  const contract = getSolverNetContract({
    id: draft.templateContractId!,
    version: draft.templateContractVersion!,
  });
  if (!contract) {
    return {
      ok: false,
      error: `unknown contract template ${draft.templateContractId}.${draft.templateContractVersion}`,
    };
  }

  // Stable solverNetId: launcher agentId + draftId tail. Draft ids are uuid-
  // based so this gives uniqueness across launchers and within a launcher.
  const draftTail = draft.draftId.replace(/^draft_/, '').slice(0, 8);
  const solverNetId = `${launcher.agentId}_${contract.id}-${contract.version}_${draftTail}`;

  const nowIso = now().toISOString();

  const manifest: UnsignedSolverNetManifestV1 = {
    schemaVersion: 'solvernet.manifest.v1',
    solverNetId,
    network,
    name: draft.name!,
    description: draft.description ?? '',
    launcher: {
      safeAddress: launcher.safeAddress,
      agentEoa: launcher.agentEoa,
      agentId: launcher.agentId,
    },
    contract: {
      id: contract.id,
      version: contract.version,
      schemas: {
        task: contract.schemas.task.json,
        solution: contract.schemas.solution.json,
        verdict: contract.schemas.verdict.json,
      },
      claimPolicyDefaults: contract.claimPolicyDefaults,
      credentialRequirements: contract.credentialRequirements,
      // Copy the readonly `inputs` arrays so the manifest's mutable-array
      // schema accepts them. Functional content is identical.
      evaluationFunction: {
        ...contract.evaluationFunction,
        inputs: [...contract.evaluationFunction.inputs],
      },
      aggregationFunction: {
        ...contract.aggregationFunction,
        inputs: [...contract.aggregationFunction.inputs],
      },
    },
    solutionPriceWei: draft.solutionPriceWei!,
    verdictPriceWei: draft.verdictPriceWei!,
    openRoles: draft.openRoles!,
    createdAt: draft.createdAt,
    launchedAt: nowIso,
  };

  return { ok: true, manifest };
}

// ── Implementation ──────────────────────────────────────────────────────────

export function registerSolverNetsEndpoints(
  app: Hono,
  deps: SolverNetsEndpointsDeps,
): void {
  const { store } = deps;

  // POST /v1/solvernets/drafts — create a new draft.
  app.post('/v1/solvernets/drafts', async (c) => {
    // Body is optional. An empty body (or a request with no body at all)
    // produces a fully-empty draft — the SPA fills it in via subsequent
    // PATCH calls as the operator walks the wizard.
    let raw: unknown = {};
    const text = await c.req.text();
    if (text.length > 0) {
      try {
        raw = JSON.parse(text);
      } catch {
        return c.json(
          { error: 'invalid_body', message: 'expected JSON body' },
          400,
        );
      }
    }

    const immutable = rejectImmutableFields(raw);
    if (immutable) {
      return c.json({ error: 'invalid_body', message: immutable.error }, 400);
    }

    const parsed = DraftEditableSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid_body',
          message: parsed.error.issues
            .map((i) => `${i.path.join('.') || '<body>'}: ${i.message}`)
            .join('; '),
        },
        400,
      );
    }

    const now = new Date().toISOString();
    const draft: DraftSolverNetRecord = {
      schemaVersion: 'solvernet.draft.v1',
      draftId: `draft_${randomUUID()}`,
      completedSteps: parsed.data.completedSteps ?? [],
      createdAt: now,
      updatedAt: now,
      ...(parsed.data.templateContractId !== undefined && {
        templateContractId: parsed.data.templateContractId,
      }),
      ...(parsed.data.templateContractVersion !== undefined && {
        templateContractVersion: parsed.data.templateContractVersion,
      }),
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && {
        description: parsed.data.description,
      }),
      ...(parsed.data.generatorConfig !== undefined && {
        generatorConfig: parsed.data.generatorConfig,
      }),
      ...(parsed.data.solutionPriceWei !== undefined && {
        solutionPriceWei: parsed.data.solutionPriceWei,
      }),
      ...(parsed.data.verdictPriceWei !== undefined && {
        verdictPriceWei: parsed.data.verdictPriceWei,
      }),
      ...(parsed.data.openRoles !== undefined && {
        openRoles: parsed.data.openRoles,
      }),
    };

    // Defensive parse: ensures the constructed shape still satisfies the
    // store's schema. If a future schema field becomes required and we
    // forget to populate it, we want a 500 here rather than a corrupt
    // file on disk.
    const validated = DraftSolverNetRecordSchema.safeParse(draft);
    if (!validated.success) {
      return c.json(
        {
          error: 'internal_error',
          message: `failed to construct draft: ${validated.error.issues.map((i) => i.message).join('; ')}`,
        },
        500,
      );
    }

    try {
      await store.writeDraft(validated.data);
    } catch (err) {
      return c.json(
        {
          error: 'store_write_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }

    return c.json(validated.data);
  });

  // GET /v1/solvernets/drafts — list all owned drafts.
  app.get('/v1/solvernets/drafts', async (c) => {
    let drafts: DraftSolverNetRecord[];
    try {
      drafts = await store.listDrafts();
    } catch (err) {
      return c.json(
        {
          error: 'store_read_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
    return c.json({ drafts });
  });

  // GET /v1/solvernets/drafts/:id — load a single draft.
  app.get('/v1/solvernets/drafts/:id', async (c) => {
    const id = c.req.param('id');
    if (!id) {
      return c.json({ error: 'invalid_invocation', message: 'missing draft id' }, 400);
    }
    let draft: DraftSolverNetRecord | null;
    try {
      draft = await store.loadDraft(id);
    } catch (err) {
      return c.json(
        {
          error: 'store_read_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
    if (!draft) {
      return c.json({ error: 'draft_not_found', message: `Unknown draft: ${id}` }, 404);
    }
    return c.json(draft);
  });

  // PATCH /v1/solvernets/drafts/:id — update a draft.
  app.patch('/v1/solvernets/drafts/:id', async (c) => {
    const id = c.req.param('id');
    if (!id) {
      return c.json({ error: 'invalid_invocation', message: 'missing draft id' }, 400);
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json(
        { error: 'invalid_body', message: 'expected JSON body' },
        400,
      );
    }

    const immutable = rejectImmutableFields(raw);
    if (immutable) {
      return c.json({ error: 'invalid_body', message: immutable.error }, 400);
    }

    const parsed = DraftEditableSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid_body',
          message: parsed.error.issues
            .map((i) => `${i.path.join('.') || '<body>'}: ${i.message}`)
            .join('; '),
        },
        400,
      );
    }

    let existing: DraftSolverNetRecord | null;
    try {
      existing = await store.loadDraft(id);
    } catch (err) {
      return c.json(
        {
          error: 'store_read_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
    if (!existing) {
      return c.json({ error: 'draft_not_found', message: `Unknown draft: ${id}` }, 404);
    }

    const next = applyEditable(existing, parsed.data, new Date().toISOString());
    const validated = DraftSolverNetRecordSchema.safeParse(next);
    if (!validated.success) {
      return c.json(
        {
          error: 'invalid_body',
          message: validated.error.issues
            .map((i) => `${i.path.join('.') || '<body>'}: ${i.message}`)
            .join('; '),
        },
        400,
      );
    }

    try {
      await store.writeDraft(validated.data);
    } catch (err) {
      return c.json(
        {
          error: 'store_write_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }

    return c.json(validated.data);
  });

  // DELETE /v1/solvernets/drafts/:id — delete a draft.
  app.delete('/v1/solvernets/drafts/:id', async (c) => {
    const id = c.req.param('id');
    if (!id) {
      return c.json({ error: 'invalid_invocation', message: 'missing draft id' }, 400);
    }

    // Surface 404 for unknown ids rather than silent-success. The SPA can
    // distinguish "I deleted the only copy" from "this id was never there"
    // — useful for stale-tab detection.
    let existing: DraftSolverNetRecord | null;
    try {
      existing = await store.loadDraft(id);
    } catch (err) {
      return c.json(
        {
          error: 'store_read_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
    if (!existing) {
      return c.json({ error: 'draft_not_found', message: `Unknown draft: ${id}` }, 404);
    }

    try {
      await store.deleteDraft(id);
    } catch (err) {
      return c.json(
        {
          error: 'store_write_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }

    return c.json({ ok: true });
  });

  // ── Task 14 routes ────────────────────────────────────────────────────────

  // POST /v1/solvernets/drafts/:id/launch — kick off the launch state machine.
  //
  // Behaviour: validate completeness, build + sign the manifest, fire
  // `launchAction.launch(...)` in the background, and return 202 with a
  // poll URL. The state machine pins to IPFS, writes the initial record,
  // broadcasts setMetadata, awaits confirmation, and spawns the generator
  // — all asynchronously. The SPA polls `GET /v1/solvernets/launched/:id`
  // to track progress (`launchProgress.phase` reflects which phase the
  // machine is currently in).
  app.post('/v1/solvernets/drafts/:id/launch', async (c) => {
    const id = c.req.param('id');
    if (!id) {
      return c.json({ error: 'invalid_invocation', message: 'missing draft id' }, 400);
    }

    if (!deps.launch) {
      return c.json(
        {
          error: 'launch_unavailable',
          message: 'launch routes are not configured; the daemon is missing launch dependencies',
        },
        503,
      );
    }
    const launchDeps = deps.launch;

    let draft: DraftSolverNetRecord | null;
    try {
      draft = await store.loadDraft(id);
    } catch (err) {
      return c.json(
        {
          error: 'store_read_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
    if (!draft) {
      return c.json({ error: 'draft_not_found', message: `Unknown draft: ${id}` }, 404);
    }

    const completeness = checkDraftCompleteness(draft);
    if (!completeness.ok) {
      return c.json(
        {
          error: 'draft_incomplete',
          message: `draft is missing required fields: ${completeness.missingFields.join(', ')}`,
          missingFields: completeness.missingFields,
        },
        400,
      );
    }

    const built = buildUnsignedManifest({
      draft,
      launcher: launchDeps.launcher,
      network: launchDeps.network,
      now: launchDeps.now ?? (() => new Date()),
    });
    if (!built.ok) {
      return c.json({ error: 'invalid_template', message: built.error }, 400);
    }

    let manifest: SolverNetManifestV1;
    try {
      manifest = await signManifest(built.manifest, launchDeps.signer.agentEoaPrivateKey);
    } catch (err) {
      return c.json(
        {
          error: 'manifest_sign_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }

    // Idempotency: if a record with this solverNetId already exists, return
    // it instead of starting a second launch. The state machine itself is
    // also idempotent (launch() routes to resume() for existing records),
    // but short-circuiting here avoids a redundant signManifest round.
    const existing = await store.loadRecord(manifest.solverNetId);
    if (existing) {
      return c.json(
        {
          solverNetId: manifest.solverNetId,
          status: existing.status,
          pollUrl: `/v1/solvernets/launched/${manifest.solverNetId}`,
        },
        202,
      );
    }

    // Fire-and-forget: the launch state machine pins, writes the record,
    // broadcasts, awaits confirmation, and spawns the generator. We do not
    // await it here — production launches can take 30+ seconds (IPFS pin +
    // tx confirmation) and the SPA tracks progress via `launchProgress`.
    void launchDeps.launchAction
      .launch({ manifest, signer: launchDeps.signer })
      .catch((err) => {
        // The state machine has already persisted the failure to disk
        // (`launchProgress.txError`); we just log so the daemon operator
        // sees the failure in stderr without crashing the process.
        // eslint-disable-next-line no-console
        console.error(
          `[solvernets] background launch ${manifest.solverNetId} failed:`,
          err,
        );
      });

    // Briefly wait for the initial record to land on disk so the SPA's
    // first poll always finds a record. The launch action's first persisted
    // checkpoint is after the IPFS upload — typically <100ms with mocked
    // ipfs (tests) or a few seconds in production. If it does not show up
    // within the timeout we return 202 anyway; the SPA's poll will reveal
    // the failure.
    const POLL_BUDGET_MS = 5_000;
    const POLL_INTERVAL_MS = 25;
    const start = Date.now();
    let initialRecord: LaunchedSolverNetRecord | null = null;
    while (Date.now() - start < POLL_BUDGET_MS) {
      initialRecord = await store.loadRecord(manifest.solverNetId);
      if (initialRecord) break;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    return c.json(
      {
        solverNetId: manifest.solverNetId,
        status: initialRecord?.status ?? 'launching',
        pollUrl: `/v1/solvernets/launched/${manifest.solverNetId}`,
      },
      202,
    );
  });

  // GET /v1/solvernets/launched/:id — read the current launched record.
  //
  // Prefers the in-memory recordRef (lifecycle / launch state machines
  // mutate it synchronously after each disk write) and falls back to disk.
  // Either source is up-to-date because both are written before the
  // operation returns.
  app.get('/v1/solvernets/launched/:id', async (c) => {
    const id = c.req.param('id');
    if (!id) {
      return c.json({ error: 'invalid_invocation', message: 'missing record id' }, 400);
    }

    // Prefer in-memory ref when available (lifecycle / launch updates land
    // there first via mutation).
    if (deps.launch) {
      const entry = deps.launch.pendingGenerators.current.find(
        (g) => g.recordRef.current.solverNetId === id,
      );
      if (entry) {
        return c.json(entry.recordRef.current);
      }
    }

    let record: LaunchedSolverNetRecord | null;
    try {
      record = await store.loadRecord(id);
    } catch (err) {
      return c.json(
        {
          error: 'store_read_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
    if (!record) {
      return c.json({ error: 'record_not_found', message: `Unknown record: ${id}` }, 404);
    }
    return c.json(record);
  });

  // PATCH /v1/solvernets/launched/:id/lifecycle — pause / resume / retire.
  //
  // Blocking: the lifecycle transition is one tx + one receipt, typically
  // 5-30 seconds. We await completion and return the updated record so the
  // SPA can re-render in a single round-trip.
  app.patch('/v1/solvernets/launched/:id/lifecycle', async (c) => {
    const id = c.req.param('id');
    if (!id) {
      return c.json({ error: 'invalid_invocation', message: 'missing record id' }, 400);
    }

    if (!deps.launch) {
      return c.json(
        {
          error: 'launch_unavailable',
          message: 'lifecycle routes are not configured',
        },
        503,
      );
    }
    const launchDeps = deps.launch;

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_body', message: 'expected JSON body' }, 400);
    }

    const parsed = LifecycleBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid_body',
          message: parsed.error.issues
            .map((i) => `${i.path.join('.') || '<body>'}: ${i.message}`)
            .join('; '),
        },
        400,
      );
    }
    const target = parsed.data.target;

    let record: LaunchedSolverNetRecord | null;
    try {
      record = await store.loadRecord(id);
    } catch (err) {
      return c.json(
        {
          error: 'store_read_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
    if (!record) {
      return c.json({ error: 'record_not_found', message: `Unknown record: ${id}` }, 404);
    }

    // Terminal-state guard at the API edge so the caller gets a typed error
    // before we even touch the state machine. The state machine also
    // rejects (it is the source of truth) but surfacing it here gives a
    // stable error code.
    if (record.status === 'retired' && target !== 'retired') {
      return c.json(
        {
          error: 'lifecycle_terminal',
          message: `SolverNet ${id} is retired; transitions are no-ops`,
        },
        400,
      );
    }

    // Idempotent no-op: caller's view matches current state, no work to do.
    if (record.status === target && record.lifecycleProgress === undefined) {
      return c.json(record);
    }

    let updated: LaunchedSolverNetRecord;
    try {
      updated = await launchDeps.lifecycleTransition.transition(record, target);
    } catch (err) {
      return c.json(
        {
          error: 'lifecycle_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }

    // Mutate the in-memory recordRef so subsequent reads (and the next
    // generator tick) see the new status without waiting for a disk reload.
    const entry = launchDeps.pendingGenerators.current.find(
      (g) => g.recordRef.current.solverNetId === id,
    );
    if (entry) {
      entry.recordRef.current = updated;
    }

    return c.json(updated);
  });

  // PATCH /v1/solvernets/launched/:id/generator-config — hot-apply config.
  //
  // Updates the persisted record's `generatorConfig` AND mutates the live
  // `configRef.current` for any pendingGenerators entry. The next generator
  // tick reads the new cadence/allowlist/caps via the ref.
  app.patch('/v1/solvernets/launched/:id/generator-config', async (c) => {
    const id = c.req.param('id');
    if (!id) {
      return c.json({ error: 'invalid_invocation', message: 'missing record id' }, 400);
    }

    if (!deps.launch) {
      return c.json(
        {
          error: 'launch_unavailable',
          message: 'generator-config routes are not configured',
        },
        503,
      );
    }
    const launchDeps = deps.launch;

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_body', message: 'expected JSON body' }, 400);
    }

    const parsed = GeneratorConfigPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid_body',
          message: parsed.error.issues
            .map((i) => `${i.path.join('.') || '<body>'}: ${i.message}`)
            .join('; '),
        },
        400,
      );
    }

    let record: LaunchedSolverNetRecord | null;
    try {
      record = await store.loadRecord(id);
    } catch (err) {
      return c.json(
        {
          error: 'store_read_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
    if (!record) {
      return c.json({ error: 'record_not_found', message: `Unknown record: ${id}` }, 404);
    }

    // Patch semantics: merge the provided fields over the existing config.
    // Operators editing one field shouldn't have to re-send the rest.
    const nextConfig: PredictionV1GeneratorRuntimeConfig = {
      ...((record.generatorConfig as PredictionV1GeneratorRuntimeConfig | undefined) ?? {}),
      ...parsed.data,
    };

    // Persist on disk. The store schema treats generatorConfig as an opaque
    // record; we widen the strongly-typed runtime config back to that shape
    // for storage.
    const updatedRecord: LaunchedSolverNetRecord = {
      ...record,
      generatorConfig: nextConfig as Record<string, unknown>,
    };
    const validated = LaunchedSolverNetRecordSchema.safeParse(updatedRecord);
    if (!validated.success) {
      return c.json(
        {
          error: 'invalid_record',
          message: `failed to construct updated record: ${validated.error.issues.map((i) => i.message).join('; ')}`,
        },
        500,
      );
    }
    try {
      await store.writeRecord(validated.data);
    } catch (err) {
      return c.json(
        {
          error: 'store_write_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }

    // Hot-apply: mutate the live configRef + recordRef in place so the next
    // generator tick sees the new config without waiting for a disk reload.
    // It is valid for there to be no pendingGenerators entry (e.g. the
    // record is paused / retired and the generator is not running) — the
    // disk write above is enough; the next time the daemon spawns the
    // generator (next launched-status flip) it will seed configRef from
    // the persisted record.
    const entry = launchDeps.pendingGenerators.current.find(
      (g) => g.recordRef.current.solverNetId === id,
    );
    if (entry) {
      entry.configRef.current = nextConfig;
      entry.recordRef.current = validated.data;
    }

    return c.json(nextConfig);
  });
}
