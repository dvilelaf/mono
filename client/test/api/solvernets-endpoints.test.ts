/**
 * SolverNet drafts CRUD endpoint tests (Task 13).
 *
 * Spec: spec/2026-05-05-solvernet-creation-and-launch.md §6.1.
 *
 * Each test stands up a fresh Hono app + tmpdir-backed SolverNet store and
 * exercises the route through `app.request(...)`. Auth wiring matches the
 * launcher-endpoints pattern: `requireUiToken` middleware in front, callers
 * supply `x-jinn-ui-token`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Hono } from 'hono';

import { registerSolverNetsEndpoints } from '../../src/api/solvernets-endpoints.js';
import { requireUiToken } from '../../src/api/handshake.js';
import {
  createSolverNetStore,
  type SolverNetStore,
} from '../../src/solvernets/store.js';

const UI_TOKEN = 'ui-token-test';

interface BuildArgs {
  store: SolverNetStore;
  withAuth?: boolean;
}

function buildTestApp(args: BuildArgs): { app: Hono; token: string } {
  const app = new Hono();
  if (args.withAuth ?? true) {
    app.use('/v1/solvernets/drafts', requireUiToken(UI_TOKEN));
    app.use('/v1/solvernets/drafts/*', requireUiToken(UI_TOKEN));
  }
  registerSolverNetsEndpoints(app, { store: args.store });
  return { app, token: UI_TOKEN };
}

let baseDir: string;
let store: SolverNetStore;

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(os.tmpdir(), 'solvernet-endpoints-'));
  store = createSolverNetStore({ baseDir });
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

const authHeaders = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-jinn-ui-token': UI_TOKEN,
});

describe('POST /v1/solvernets/drafts', () => {
  it('creates an empty draft with auto-generated draftId', async () => {
    const { app, token } = buildTestApp({ store });
    const res = await app.request('/v1/solvernets/drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-jinn-ui-token': token },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      draftId: string;
      schemaVersion: string;
      completedSteps: string[];
      createdAt: string;
      updatedAt: string;
    };
    expect(body.draftId).toMatch(/.+/);
    expect(body.schemaVersion).toBe('solvernet.draft.v1');
    expect(body.completedSteps).toEqual([]);
    expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.updatedAt).toBe(body.createdAt);

    // Persisted on disk, listable, loadable.
    const drafts = await store.listDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.draftId).toBe(body.draftId);
  });

  it('creates a draft with no body at all', async () => {
    const { app } = buildTestApp({ store });
    const res = await app.request('/v1/solvernets/drafts', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draftId: string };
    expect(body.draftId).toMatch(/.+/);
  });

  it('persists fields supplied in the create body', async () => {
    const { app } = buildTestApp({ store });
    const res = await app.request('/v1/solvernets/drafts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: 'My Net',
        description: 'a description',
        templateContractId: 'prediction-v1',
        templateContractVersion: '1.0.0',
        solutionPriceWei: '1000000000000000000',
        openRoles: ['solver'],
        completedSteps: ['define'],
        generatorConfig: { cadenceMs: 60000 },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      draftId: string;
      name: string;
      description: string;
      templateContractId: string;
      templateContractVersion: string;
      solutionPriceWei: string;
      openRoles: string[];
      completedSteps: string[];
      generatorConfig: Record<string, unknown>;
    };
    expect(body.name).toBe('My Net');
    expect(body.description).toBe('a description');
    expect(body.templateContractId).toBe('prediction-v1');
    expect(body.templateContractVersion).toBe('1.0.0');
    expect(body.solutionPriceWei).toBe('1000000000000000000');
    expect(body.openRoles).toEqual(['solver']);
    expect(body.completedSteps).toEqual(['define']);
    expect(body.generatorConfig).toEqual({ cadenceMs: 60000 });

    // Round-trip on disk.
    const loaded = await store.loadDraft(body.draftId);
    expect(loaded?.name).toBe('My Net');
  });

  it('rejects body with wrong field types', async () => {
    const { app } = buildTestApp({ store });
    const res = await app.request('/v1/solvernets/drafts', {
      method: 'POST',
      headers: authHeaders(),
      // `name` must be a string, not a number
      body: JSON.stringify({ name: 42 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('invalid_body');
    expect(body.message).toMatch(/.+/);

    // Nothing persisted.
    expect(await store.listDrafts()).toEqual([]);
  });

  it('rejects body with invalid openRoles enum value', async () => {
    const { app } = buildTestApp({ store });
    const res = await app.request('/v1/solvernets/drafts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ openRoles: ['launcher'] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_body');
  });

  it('rejects malformed JSON', async () => {
    const { app } = buildTestApp({ store });
    const res = await app.request('/v1/solvernets/drafts', {
      method: 'POST',
      headers: authHeaders(),
      body: '{not json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_body');
  });

  it('requires auth', async () => {
    const { app } = buildTestApp({ store });
    const res = await app.request('/v1/solvernets/drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/solvernets/drafts/:id', () => {
  it('returns the persisted draft', async () => {
    const { app } = buildTestApp({ store });
    // Seed via POST so we have a real draftId.
    const created = (await (
      await app.request('/v1/solvernets/drafts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: 'orig' }),
      })
    ).json()) as { draftId: string };

    const res = await app.request(`/v1/solvernets/drafts/${created.draftId}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draftId: string; name: string };
    expect(body.draftId).toBe(created.draftId);
    expect(body.name).toBe('orig');
  });

  it('returns 404 for unknown draft id', async () => {
    const { app } = buildTestApp({ store });
    const res = await app.request('/v1/solvernets/drafts/draft_does_not_exist', {
      method: 'GET',
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('draft_not_found');
  });
});

describe('PATCH /v1/solvernets/drafts/:id', () => {
  it('updates supplied fields and preserves others', async () => {
    const { app } = buildTestApp({ store });
    const created = (await (
      await app.request('/v1/solvernets/drafts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: 'orig', description: 'keep me' }),
      })
    ).json()) as { draftId: string; createdAt: string };

    // Wait a millisecond so updatedAt observably moves.
    await new Promise((r) => setTimeout(r, 5));

    const res = await app.request(`/v1/solvernets/drafts/${created.draftId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'updated', solutionPriceWei: '42' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      draftId: string;
      name: string;
      description: string;
      solutionPriceWei: string;
      createdAt: string;
      updatedAt: string;
    };
    expect(body.draftId).toBe(created.draftId);
    expect(body.name).toBe('updated');
    expect(body.description).toBe('keep me');
    expect(body.solutionPriceWei).toBe('42');
    // createdAt unchanged, updatedAt moved.
    expect(body.createdAt).toBe(created.createdAt);
    expect(body.updatedAt).not.toBe(created.createdAt);

    // Disk state matches.
    const loaded = await store.loadDraft(created.draftId);
    expect(loaded?.name).toBe('updated');
    expect(loaded?.description).toBe('keep me');
  });

  it('rejects attempts to change draftId or createdAt (immutable fields)', async () => {
    const { app } = buildTestApp({ store });
    const created = (await (
      await app.request('/v1/solvernets/drafts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: 'orig' }),
      })
    ).json()) as { draftId: string; createdAt: string };

    const res = await app.request(`/v1/solvernets/drafts/${created.draftId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ draftId: 'evil_id' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('invalid_body');
    expect(body.message).toMatch(/draftId/);

    // Disk state unchanged.
    const loaded = await store.loadDraft(created.draftId);
    expect(loaded?.draftId).toBe(created.draftId);
    expect(loaded?.name).toBe('orig');
  });

  it('returns 404 for unknown draft id', async () => {
    const { app } = buildTestApp({ store });
    const res = await app.request('/v1/solvernets/drafts/draft_unknown', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'whatever' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('draft_not_found');
  });

  it('rejects body with wrong field types', async () => {
    const { app } = buildTestApp({ store });
    const created = (await (
      await app.request('/v1/solvernets/drafts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      })
    ).json()) as { draftId: string };

    const res = await app.request(`/v1/solvernets/drafts/${created.draftId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ openRoles: ['not-a-real-role'] }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    const { app } = buildTestApp({ store });
    const created = (await (
      await app.request('/v1/solvernets/drafts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      })
    ).json()) as { draftId: string };

    const res = await app.request(`/v1/solvernets/drafts/${created.draftId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: '{nope',
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /v1/solvernets/drafts/:id', () => {
  it('deletes a draft and subsequent GET returns 404', async () => {
    const { app } = buildTestApp({ store });
    const created = (await (
      await app.request('/v1/solvernets/drafts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      })
    ).json()) as { draftId: string };

    const delRes = await app.request(`/v1/solvernets/drafts/${created.draftId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(delRes.status).toBe(200);
    const delBody = (await delRes.json()) as { ok: boolean };
    expect(delBody.ok).toBe(true);

    const getRes = await app.request(`/v1/solvernets/drafts/${created.draftId}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    expect(getRes.status).toBe(404);
  });

  it('returns 404 for unknown draft id', async () => {
    const { app } = buildTestApp({ store });
    const res = await app.request('/v1/solvernets/drafts/draft_missing', {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('draft_not_found');
  });
});

describe('GET /v1/solvernets/drafts', () => {
  it('returns an empty array when there are no drafts', async () => {
    const { app } = buildTestApp({ store });
    const res = await app.request('/v1/solvernets/drafts', {
      method: 'GET',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { drafts: unknown[] };
    expect(body.drafts).toEqual([]);
  });

  it('returns all owned drafts', async () => {
    const { app } = buildTestApp({ store });
    // Seed three drafts.
    for (const name of ['a', 'b', 'c']) {
      await app.request('/v1/solvernets/drafts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      });
    }

    const res = await app.request('/v1/solvernets/drafts', {
      method: 'GET',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { drafts: Array<{ name?: string }> };
    expect(body.drafts).toHaveLength(3);
    expect(body.drafts.map((d) => d.name).sort()).toEqual(['a', 'b', 'c']);
  });

  it('requires auth', async () => {
    const { app } = buildTestApp({ store });
    const res = await app.request('/v1/solvernets/drafts', {
      method: 'GET',
      // No token.
      headers: {},
    });
    expect(res.status).toBe(401);
  });
});
