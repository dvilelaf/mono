/**
 * SolverNet drafts CRUD + launch/lifecycle/generator-config endpoint tests
 * (Tasks 13 and 14).
 *
 * Spec: spec/2026-05-05-solvernet-creation-and-launch.md §6.1, §10.
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
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import {
  registerSolverNetsEndpoints,
  type SolverNetsEndpointsDeps,
} from '../../src/api/solvernets-endpoints.js';
import { requireUiToken } from '../../src/api/handshake.js';
import {
  createSolverNetStore,
  type LaunchedSolverNetRecord,
  type SolverNetStore,
} from '../../src/solvernets/store.js';
import {
  LaunchAction,
  type LaunchActionDeps,
} from '../../src/solvernets/launch-state-machine.js';
import {
  LifecycleTransition,
  type LifecycleTransitionDeps,
} from '../../src/solvernets/lifecycle-transitions.js';
import type { PendingGeneratorSpawn } from '../../src/solvernets/daemon-init.js';
import type {
  IpfsClient,
  MetadataPublisher,
  SetMetadataPublishResult,
  SubgraphClient,
} from '../../src/solvernets/registry-client-erc8004.js';
import type {
  SignerWithAgentEoa,
  SolverNetRegistryClient,
} from '../../src/solvernets/registry-client.js';
import type { PredictionV1GeneratorRuntimeConfig } from '../../src/solver-types/prediction-v1-auto.js';

const UI_TOKEN = 'ui-token-test';

interface BuildArgs {
  store: SolverNetStore;
  withAuth?: boolean;
  // Optional Task 14 deps. When omitted, only the Task 13 (drafts) endpoints
  // are exercised.
  launch?: SolverNetsEndpointsDeps['launch'];
}

function buildTestApp(args: BuildArgs): { app: Hono; token: string } {
  const app = new Hono();
  if (args.withAuth ?? true) {
    app.use('/v1/solvernets/drafts', requireUiToken(UI_TOKEN));
    app.use('/v1/solvernets/drafts/*', requireUiToken(UI_TOKEN));
    app.use('/v1/solvernets/launched/*', requireUiToken(UI_TOKEN));
  }
  const deps: SolverNetsEndpointsDeps = { store: args.store };
  if (args.launch !== undefined) deps.launch = args.launch;
  registerSolverNetsEndpoints(app, deps);
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

// ─────────────────────────────────────────────────────────────────────────────
// Task 14 — launch / lifecycle / generator-config / launched-record GET
// ─────────────────────────────────────────────────────────────────────────────

interface MockIpfs extends IpfsClient {
  uploadCalls: number;
}

function makeMockIpfs(): MockIpfs {
  let uploadCalls = 0;
  const uploads = new Map<string, unknown>();
  function cidOf(data: unknown): string {
    const json = JSON.stringify(data);
    let h = 0;
    for (const ch of json) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `bafy-test-${h.toString(16).padStart(8, '0')}`;
  }
  return {
    async upload(data) {
      uploadCalls += 1;
      const cid = cidOf(data);
      uploads.set(cid, data);
      return cid;
    },
    async fetch(cid) {
      const found = uploads.get(cid);
      if (found === undefined) throw new Error(`mock ipfs: cid not found ${cid}`);
      return found;
    },
    get uploadCalls() {
      return uploadCalls;
    },
  };
}

interface MockPublisher extends MetadataPublisher {
  calls: Array<{ key: string; value: Uint8Array }>;
}

function makeMockPublisher(): MockPublisher {
  const calls: Array<{ key: string; value: Uint8Array }> = [];
  let nextBlock = 100;
  return {
    async setMetadata(args): Promise<SetMetadataPublishResult> {
      calls.push({ key: args.key, value: args.value });
      return {
        txHash: `0x${'aa'.repeat(31)}${calls.length.toString(16).padStart(2, '0')}` as `0x${string}`,
        blockNumber: nextBlock++,
      };
    },
    get calls() {
      return calls;
    },
  };
}

function makeNoopSubgraph(): SubgraphClient {
  return {
    async fetchSetMetadataEvents() {
      return [];
    },
    async fetchSetMetadataEventsForCid() {
      return [];
    },
  };
}

interface MockRegistry extends SolverNetRegistryClient {
  publishLifecycleCalls: Array<{
    manifestCid: string;
    target: 'launched' | 'paused' | 'retired';
  }>;
}

function makeMockRegistry(): MockRegistry {
  const publishLifecycleCalls: Array<{
    manifestCid: string;
    target: 'launched' | 'paused' | 'retired';
  }> = [];
  let nextBlock = 200;
  return {
    async publishManifest() {
      throw new Error('publishManifest not used in API tests (LaunchAction handles it)');
    },
    async publishLifecycleTransition(args) {
      publishLifecycleCalls.push({ manifestCid: args.manifestCid, target: args.target });
      return {
        metadataTxHash: `0x${'bb'.repeat(31)}${publishLifecycleCalls.length
          .toString(16)
          .padStart(2, '0')}` as `0x${string}`,
        metadataBlockNumber: nextBlock++,
      };
    },
    async listLaunched() {
      return [];
    },
    async getManifest() {
      throw new Error('not used');
    },
    async getLifecycleStatus() {
      throw new Error('not used');
    },
    get publishLifecycleCalls() {
      return publishLifecycleCalls;
    },
  };
}

interface ConfirmHelper {
  awaitTxConfirmation: (txHash: `0x${string}`) => Promise<{ blockNumber: number }>;
  confirms: Array<`0x${string}`>;
}

function makeConfirmHelper(): ConfirmHelper {
  const confirms: Array<`0x${string}`> = [];
  let nextBlock = 300;
  return {
    confirms,
    async awaitTxConfirmation(txHash) {
      confirms.push(txHash);
      return { blockNumber: nextBlock++ };
    },
  };
}

/**
 * Build a complete launch dep bundle around real `LaunchAction` and
 * `LifecycleTransition` instances backed by the test mocks. Mirrors the
 * production wiring in `daemon-init.ts` minus the in-memory pendingGenerators
 * — we manage those directly so tests can assert on configRef mutation.
 */
function makeLaunchDeps(args: {
  store: SolverNetStore;
  pendingGenerators: { current: PendingGeneratorSpawn[] };
  signer?: SignerWithAgentEoa;
  spawnGenerator?: (record: LaunchedSolverNetRecord) => Promise<void>;
  startGenerator?: (record: LaunchedSolverNetRecord) => Promise<void>;
  stopGenerator?: (record: LaunchedSolverNetRecord) => Promise<void>;
  publisher?: MetadataPublisher;
}): {
  launch: SolverNetsEndpointsDeps['launch'];
  ipfs: MockIpfs;
  publisher: MetadataPublisher;
  subgraph: SubgraphClient;
  registry: MockRegistry;
  signer: SignerWithAgentEoa;
} {
  const ipfs = makeMockIpfs();
  const publisher = args.publisher ?? makeMockPublisher();
  const subgraph = makeNoopSubgraph();
  const registry = makeMockRegistry();
  const confirm = makeConfirmHelper();

  const pk = generatePrivateKey();
  const acct = privateKeyToAccount(pk);
  const signer: SignerWithAgentEoa = args.signer ?? {
    agentEoaAddress: acct.address,
    agentEoaPrivateKey: pk,
    agentId: '5474',
  };

  const launchDeps: LaunchActionDeps = {
    store: args.store,
    ipfs,
    publisher,
    subgraph,
    awaitTxConfirmation: confirm.awaitTxConfirmation,
    spawnGenerator: args.spawnGenerator ?? (async () => undefined),
    now: () => new Date('2026-05-06T00:00:00.000Z'),
  };
  const launchAction = new LaunchAction(launchDeps);

  const lifecycleDeps: LifecycleTransitionDeps = {
    store: args.store,
    registry,
    signer,
    subgraph,
    awaitTxConfirmation: confirm.awaitTxConfirmation,
    startGenerator: args.startGenerator ?? (async () => undefined),
    stopGenerator: args.stopGenerator ?? (async () => undefined),
    now: () => new Date('2026-05-06T01:00:00.000Z'),
  };
  const lifecycleTransition = new LifecycleTransition(lifecycleDeps);

  return {
    launch: {
      launchAction,
      lifecycleTransition,
      pendingGenerators: args.pendingGenerators,
      signer,
      network: 'base-sepolia',
      launcher: {
        safeAddress: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        agentEoa: signer.agentEoaAddress,
        agentId: signer.agentId,
      },
      now: () => new Date('2026-05-06T00:00:00.000Z'),
    },
    ipfs,
    publisher,
    subgraph,
    registry,
    signer,
  };
}

/**
 * Seed a fully-launchable draft via the API and return its draftId.
 */
async function seedLaunchableDraft(
  app: Hono,
): Promise<string> {
  const res = await app.request('/v1/solvernets/drafts', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      name: 'Prediction Markets — Test',
      description: 'A test SolverNet for launch endpoint tests.',
      templateContractId: 'prediction',
      templateContractVersion: 'v1',
      solutionPriceWei: '1000000000000000',
      verdictPriceWei: '500000000000000',
      openRoles: ['solver', 'evaluator'],
      generatorConfig: { cadenceMs: 60000 },
      completedSteps: ['define', 'reviewContract', 'configureGenerator', 'configurePricing'],
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { draftId: string };
  return body.draftId;
}

async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  timeoutMs = 1000,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result !== null && result !== undefined) return result;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`waitFor: timed out after ${timeoutMs}ms`);
}

describe('POST /v1/solvernets/drafts/:id/launch (Task 14)', () => {
  it('happy path: launches draft → record on disk, 202 with pollUrl, GET returns record', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const draftId = await seedLaunchableDraft(app);

    const res = await app.request(`/v1/solvernets/drafts/${draftId}/launch`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      solverNetId: string;
      status: string;
      pollUrl: string;
    };
    expect(body.solverNetId).toMatch(/.+/);
    expect(body.pollUrl).toBe(`/v1/solvernets/launched/${body.solverNetId}`);

    // Wait for background launch to complete: state machine eventually flips
    // status to 'launched'.
    const launched = await waitFor(async () => {
      const r = await store.loadRecord(body.solverNetId);
      return r?.status === 'launched' ? r : null;
    });
    expect(launched.solverNetId).toBe(body.solverNetId);
    expect(launched.manifestCid).toMatch(/^bafy-test-/);

    // Subsequent GET returns the record.
    const getRes = await app.request(body.pollUrl, {
      method: 'GET',
      headers: authHeaders(),
    });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as LaunchedSolverNetRecord;
    expect(getBody.solverNetId).toBe(body.solverNetId);
    expect(getBody.status).toBe('launched');
  });

  it('rejects launch on a draft missing required fields with 400 + missingFields', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    // Draft with only name set — missing description, prices, openRoles, template.
    const create = (await (
      await app.request('/v1/solvernets/drafts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: 'incomplete' }),
      })
    ).json()) as { draftId: string };

    const res = await app.request(`/v1/solvernets/drafts/${create.draftId}/launch`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      missingFields: string[];
    };
    expect(body.error).toBe('draft_incomplete');
    expect(body.missingFields).toEqual(
      expect.arrayContaining([
        'description',
        'templateContractId',
        'templateContractVersion',
        'solutionPriceWei',
        'verdictPriceWei',
        'openRoles',
      ]),
    );
  });

  it('rejects launch on unknown draft id with 404', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const res = await app.request('/v1/solvernets/drafts/draft_does_not_exist/launch', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('draft_not_found');
  });

  it('returns 503 when launch deps are not configured', async () => {
    const { app } = buildTestApp({ store });

    const draftId = await seedLaunchableDraft(app);

    const res = await app.request(`/v1/solvernets/drafts/${draftId}/launch`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('launch_unavailable');
  });
});

describe('PATCH /v1/solvernets/launched/:id/lifecycle (Task 14)', () => {
  async function seedLaunchedRecord(
    app: Hono,
  ): Promise<LaunchedSolverNetRecord> {
    const draftId = await seedLaunchableDraft(app);
    const launchRes = await app.request(`/v1/solvernets/drafts/${draftId}/launch`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const launchBody = (await launchRes.json()) as { solverNetId: string };
    const launched = await waitFor(async () => {
      const r = await store.loadRecord(launchBody.solverNetId);
      return r?.status === 'launched' ? r : null;
    });
    return launched;
  }

  it('pause: launched → paused, stopGenerator called, status persisted', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const stops: LaunchedSolverNetRecord[] = [];
    const launchBundle = makeLaunchDeps({
      store,
      pendingGenerators,
      stopGenerator: async (r) => {
        stops.push(r);
      },
    });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const launched = await seedLaunchedRecord(app);

    const res = await app.request(
      `/v1/solvernets/launched/${launched.solverNetId}/lifecycle`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ target: 'paused' }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LaunchedSolverNetRecord;
    expect(body.status).toBe('paused');
    expect(stops).toHaveLength(1);

    const onDisk = await store.loadRecord(launched.solverNetId);
    expect(onDisk?.status).toBe('paused');
  });

  it('resume: paused → launched, startGenerator called', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const starts: LaunchedSolverNetRecord[] = [];
    const launchBundle = makeLaunchDeps({
      store,
      pendingGenerators,
      startGenerator: async (r) => {
        starts.push(r);
      },
    });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const launched = await seedLaunchedRecord(app);

    // First pause.
    await app.request(`/v1/solvernets/launched/${launched.solverNetId}/lifecycle`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ target: 'paused' }),
    });

    const res = await app.request(
      `/v1/solvernets/launched/${launched.solverNetId}/lifecycle`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ target: 'launched' }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LaunchedSolverNetRecord;
    expect(body.status).toBe('launched');
    expect(starts).toHaveLength(1);
  });

  it('retire: launched → retired, stopGenerator called, terminal', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const stops: LaunchedSolverNetRecord[] = [];
    const launchBundle = makeLaunchDeps({
      store,
      pendingGenerators,
      stopGenerator: async (r) => {
        stops.push(r);
      },
    });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const launched = await seedLaunchedRecord(app);

    const res = await app.request(
      `/v1/solvernets/launched/${launched.solverNetId}/lifecycle`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ target: 'retired' }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LaunchedSolverNetRecord;
    expect(body.status).toBe('retired');
    expect(stops).toHaveLength(1);
  });

  it('refuses to transition a retired record (terminal)', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const launched = await seedLaunchedRecord(app);

    // Retire first.
    await app.request(`/v1/solvernets/launched/${launched.solverNetId}/lifecycle`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ target: 'retired' }),
    });

    const res = await app.request(
      `/v1/solvernets/launched/${launched.solverNetId}/lifecycle`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ target: 'paused' }),
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('lifecycle_terminal');
  });

  it('idempotent no-op when target equals current status', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const stops: LaunchedSolverNetRecord[] = [];
    const launchBundle = makeLaunchDeps({
      store,
      pendingGenerators,
      stopGenerator: async (r) => {
        stops.push(r);
      },
    });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const launched = await seedLaunchedRecord(app);

    // Pause.
    await app.request(`/v1/solvernets/launched/${launched.solverNetId}/lifecycle`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ target: 'paused' }),
    });
    expect(stops).toHaveLength(1);

    // Pause again — should be a no-op.
    const res = await app.request(
      `/v1/solvernets/launched/${launched.solverNetId}/lifecycle`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ target: 'paused' }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LaunchedSolverNetRecord;
    expect(body.status).toBe('paused');
    // No additional stopGenerator call.
    expect(stops).toHaveLength(1);
  });

  it('rejects unknown record id with 404', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const res = await app.request(
      '/v1/solvernets/launched/missing-id/lifecycle',
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ target: 'paused' }),
      },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('record_not_found');
  });

  it('rejects body with invalid target value', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const launched = await seedLaunchedRecord(app);

    const res = await app.request(
      `/v1/solvernets/launched/${launched.solverNetId}/lifecycle`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ target: 'banana' }),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /v1/solvernets/launched/:id/generator-config (Task 14)', () => {
  it('updates configRef.current AND the record on disk; subsequent GET reflects it', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    // Seed launched record + corresponding pendingGenerator entry.
    const draftId = await seedLaunchableDraft(app);
    const launchRes = await app.request(`/v1/solvernets/drafts/${draftId}/launch`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const launchBody = (await launchRes.json()) as { solverNetId: string };
    const launched = await waitFor(async () => {
      const r = await store.loadRecord(launchBody.solverNetId);
      return r?.status === 'launched' ? r : null;
    });

    // Construct a pendingGenerators entry mirroring what daemon-init.ts
    // would produce. The endpoint mutates configRef.current in place.
    const recordRef = { current: launched };
    const configRef = {
      current: { cadenceMs: 60000 } as PredictionV1GeneratorRuntimeConfig,
    };
    pendingGenerators.current.push({ record: launched, recordRef, configRef });

    const res = await app.request(
      `/v1/solvernets/launched/${launched.solverNetId}/generator-config`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          cadenceMs: 30000,
          maxNewRoundsPerPoll: 7,
          allowlistConditionIds: ['0xabc'],
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as PredictionV1GeneratorRuntimeConfig;
    expect(body.cadenceMs).toBe(30000);
    expect(body.maxNewRoundsPerPoll).toBe(7);
    expect(body.allowlistConditionIds).toEqual(['0xabc']);

    // Hot-apply: configRef mutated in place.
    expect(configRef.current.cadenceMs).toBe(30000);
    expect(configRef.current.maxNewRoundsPerPoll).toBe(7);
    expect(configRef.current.allowlistConditionIds).toEqual(['0xabc']);

    // Disk persistence on the launched record.
    const onDisk = await store.loadRecord(launched.solverNetId);
    expect(onDisk?.generatorConfig).toEqual({
      cadenceMs: 30000,
      maxNewRoundsPerPoll: 7,
      allowlistConditionIds: ['0xabc'],
    });

    // Subsequent GET reflects the on-disk record.
    const getRes = await app.request(`/v1/solvernets/launched/${launched.solverNetId}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    const getBody = (await getRes.json()) as LaunchedSolverNetRecord;
    expect(getBody.generatorConfig).toEqual({
      cadenceMs: 30000,
      maxNewRoundsPerPoll: 7,
      allowlistConditionIds: ['0xabc'],
    });
  });

  it('updates record on disk even when no pendingGenerator entry exists (paused records)', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    // Seed launched record without adding to pendingGenerators (mirrors a
    // paused record where the daemon stopped the generator).
    const draftId = await seedLaunchableDraft(app);
    const launchRes = await app.request(`/v1/solvernets/drafts/${draftId}/launch`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const launchBody = (await launchRes.json()) as { solverNetId: string };
    const launched = await waitFor(async () => {
      const r = await store.loadRecord(launchBody.solverNetId);
      return r?.status === 'launched' ? r : null;
    });

    const res = await app.request(
      `/v1/solvernets/launched/${launched.solverNetId}/generator-config`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ cadenceMs: 12345 }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as PredictionV1GeneratorRuntimeConfig;
    expect(body.cadenceMs).toBe(12345);

    const onDisk = await store.loadRecord(launched.solverNetId);
    expect(onDisk?.generatorConfig).toEqual({ cadenceMs: 12345 });
  });

  it('rejects unknown record id with 404', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const res = await app.request(
      '/v1/solvernets/launched/no-such-record/generator-config',
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ cadenceMs: 1000 }),
      },
    );
    expect(res.status).toBe(404);
  });

  it('rejects body with invalid field types', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const draftId = await seedLaunchableDraft(app);
    const launchRes = await app.request(`/v1/solvernets/drafts/${draftId}/launch`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const { solverNetId } = (await launchRes.json()) as { solverNetId: string };
    await waitFor(async () => {
      const r = await store.loadRecord(solverNetId);
      return r?.status === 'launched' ? r : null;
    });

    const res = await app.request(
      `/v1/solvernets/launched/${solverNetId}/generator-config`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ cadenceMs: 'fast' }),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/solvernets/launched/:id (Task 14)', () => {
  it('returns the persisted launched record', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const draftId = await seedLaunchableDraft(app);
    const launchRes = await app.request(`/v1/solvernets/drafts/${draftId}/launch`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const { solverNetId } = (await launchRes.json()) as { solverNetId: string };
    await waitFor(async () => {
      const r = await store.loadRecord(solverNetId);
      return r?.status === 'launched' ? r : null;
    });

    const res = await app.request(`/v1/solvernets/launched/${solverNetId}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as LaunchedSolverNetRecord;
    expect(body.solverNetId).toBe(solverNetId);
    expect(body.status).toBe('launched');
    expect(body.manifestCid).toMatch(/.+/);
  });

  it('returns 404 for unknown record id', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const res = await app.request('/v1/solvernets/launched/missing-id', {
      method: 'GET',
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it('requires auth', async () => {
    const pendingGenerators = { current: [] as PendingGeneratorSpawn[] };
    const launchBundle = makeLaunchDeps({ store, pendingGenerators });
    const { app } = buildTestApp({ store, launch: launchBundle.launch });

    const res = await app.request('/v1/solvernets/launched/anything', {
      method: 'GET',
      headers: {},
    });
    expect(res.status).toBe(401);
  });
});
