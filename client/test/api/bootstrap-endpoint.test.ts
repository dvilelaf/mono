import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { addBootstrapRoutes } from '../../src/api/bootstrap-endpoint.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeFixtureEarningDir(state: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'jinn-bootstrap-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'earning_state.json'), JSON.stringify(state));
  return dir;
}

describe('GET /v1/bootstrap', () => {
  it('returns the current bootstrap step + per-step status when state file exists', async () => {
    const earningDir = makeFixtureEarningDir({
      master_address: '0xabc',
      chain: 'base-sepolia',
      services: [{ index: 0, step: 'awaiting_funding', safe_address: '0xsafe' }],
    });
    const app = new Hono();
    addBootstrapRoutes(app, { earningDir });
    const res = await app.request('/v1/bootstrap');
    expect(res.status).toBe(200);
    const body = await res.json() as { mode: string; currentStep: string; services: unknown[] };
    expect(body.mode).toBe('setup');
    expect(body.currentStep).toBe('awaiting_funding');
    expect(body.services).toHaveLength(1);
  });

  it('returns mode=running when all services are complete', async () => {
    const earningDir = makeFixtureEarningDir({
      master_address: '0xabc',
      chain: 'base-sepolia',
      services: [{ index: 0, step: 'complete', safe_address: '0xsafe' }],
    });
    const app = new Hono();
    addBootstrapRoutes(app, { earningDir });
    const res = await app.request('/v1/bootstrap');
    const body = await res.json() as { mode: string };
    expect(body.mode).toBe('running');
  });

  it('returns mode=uninitialized when no state file exists', async () => {
    const earningDir = mkdtempSync(join(tmpdir(), 'jinn-bootstrap-empty-'));
    const app = new Hono();
    addBootstrapRoutes(app, { earningDir });
    const res = await app.request('/v1/bootstrap');
    const body = await res.json() as { mode: string };
    expect(body.mode).toBe('uninitialized');
  });
});
