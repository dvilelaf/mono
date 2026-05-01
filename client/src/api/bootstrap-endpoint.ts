/**
 * GET /v1/bootstrap — exposes the fleet bootstrap state machine to the SPA.
 *
 * Reads the persisted fleet state file at `<earningDir>/earning_state.json`
 * (the same file FleetStateStore writes) and returns:
 * - mode: 'uninitialized' | 'setup' | 'running'
 * - currentStep: the lowest-progress step across all services
 * - per-service step status
 *
 * No external chain reads — state file is the source of truth for this endpoint.
 */
import type { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface BootstrapEndpointConfig {
  earningDir: string;
}

const STEPS = [
  'wallet',
  'safe_predicted',
  'awaiting_funding',
  'safe_deployed',
  'service_created',
  'service_activated',
  'agents_registered',
  'service_deployed',
  'service_staked',
  'mech_deployed',
  'complete',
] as const;

type Step = typeof STEPS[number];
const STEP_INDEX = new Map<Step, number>(STEPS.map((s, i) => [s, i]));

interface ServiceState {
  index: number;
  step: Step;
  safe_address?: string;
  service_id?: number;
}

interface FleetStateOnDisk {
  master_address?: string;
  chain?: string;
  services?: ServiceState[];
}

export function addBootstrapRoutes(app: Hono, config: BootstrapEndpointConfig): void {
  app.get('/v1/bootstrap', (c) => {
    const path = join(config.earningDir, 'earning_state.json');
    if (!existsSync(path)) {
      return c.json({
        schemaVersion: 1,
        mode: 'uninitialized',
        steps: STEPS,
        currentStep: STEPS[0],
        services: [],
      });
    }

    let parsed: FleetStateOnDisk;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf-8')) as FleetStateOnDisk;
    } catch {
      return c.json({ error: 'unreadable_state_file' }, 500);
    }

    const services = parsed.services ?? [];
    const currentStepIdx = services.length === 0
      ? 0
      : Math.min(...services.map((s) => STEP_INDEX.get(s.step) ?? 0));
    const currentStep = STEPS[currentStepIdx];
    const allComplete = services.length > 0 && services.every((s) => s.step === 'complete');

    return c.json({
      schemaVersion: 1,
      mode: allComplete ? 'running' : 'setup',
      steps: STEPS,
      currentStep,
      services,
      master_address: parsed.master_address,
      chain: parsed.chain,
    });
  });
}
