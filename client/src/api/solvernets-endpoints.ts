/**
 * SolverNet creation/launch HTTP routes.
 *
 * Spec: spec/2026-05-05-solvernet-creation-and-launch.md §6.1.
 *
 * This file is the initial scaffolding for the broader `/v1/solvernets/*`
 * router. Task 13 ships the drafts CRUD subset; Tasks 14/15 will extend the
 * same module with launch + lifecycle endpoints (sharing `SolverNetsEndpointsDeps`).
 *
 * Currently registers:
 *   POST   /v1/solvernets/drafts       — create a new (possibly empty) draft.
 *   GET    /v1/solvernets/drafts       — list owned drafts.
 *   GET    /v1/solvernets/drafts/:id   — load a single draft.
 *   PATCH  /v1/solvernets/drafts/:id   — update fields on a draft.
 *   DELETE /v1/solvernets/drafts/:id   — delete a draft.
 *
 * Auth: route mounting is handled by server.ts (UI-token gate via
 * `requireUiToken`). This module assumes the gate is in place upstream
 * — the same posture as `setup-endpoints.ts` / `launcher-endpoints.ts`.
 *
 * Validation posture: drafts are partial-by-construction. Field-shape
 * validation runs (so we never persist garbage that breaks the loader),
 * but business-rule validation — "price must be set", "openRoles must be
 * non-empty" — does NOT run here. Those checks belong in a future
 * "promote draft to launchable" gate (Task 14), so an operator can fill
 * out the wizard out-of-order without the API rejecting half-finished
 * drafts.
 */
import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  DraftSolverNetRecordSchema,
  type DraftSolverNetRecord,
  type SolverNetStore,
} from '../solvernets/store.js';

export interface SolverNetsEndpointsDeps {
  store: SolverNetStore;
  // Future (Tasks 14/15): registry, launchAction, lifecycleTransition, etc.
}

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
}
