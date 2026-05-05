import { describe, it, expect, vi } from 'vitest';
import { makePredictionV1Generator } from '../../src/solver-types/prediction-v1-auto.js';

/**
 * Hot-spawn role gate (Task 4 of spec/2026-05-05-launcher-role-and-mode.md).
 *
 * Always-spawn the generator; gate the actual Polymarket poll inside the
 * generator's tick on `roles.includes('launching')`. Toggling `'launching'`
 * in or out of `roles` must take effect within one cadence — no daemon
 * restart. The closure-based `getRoles` config callback is what makes the
 * hot-flip work: a single generator instance reads the latest role array
 * from the live `JinnConfig` reference.
 *
 * The generator polls Polymarket via `fetchImpl`. We assert no HTTP traffic
 * happens when `'launching'` is not in roles, and that traffic happens when
 * it is — same instance, no recreation.
 */
describe('prediction-v1-auto: role gate', () => {
  it('does not poll Polymarket when roles does not include launching', async () => {
    const fetchSpy = vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const gen = makePredictionV1Generator({
      fetchImpl: fetchSpy,
      cadenceMs: 0,
      getRoles: () => ['solving'], // operator-only, no launching
    });
    const result = await gen();
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('polls Polymarket when roles includes launching', async () => {
    const fetchSpy = vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const gen = makePredictionV1Generator({
      fetchImpl: fetchSpy,
      cadenceMs: 0,
      getRoles: () => ['launching'],
    });
    await gen();
    expect((fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('hot-flips: same instance gates poll behaviour as roles change', async () => {
    let roles: Array<'solving' | 'evaluating' | 'launching'> = ['solving'];
    const fetchSpy = vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const gen = makePredictionV1Generator({
      fetchImpl: fetchSpy,
      cadenceMs: 0,
      getRoles: () => roles,
    });

    await gen();
    expect((fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);

    // Operator flips role on at runtime — no generator recreation.
    roles = ['launching'];
    await gen();
    expect((fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);

    const callsAfterEnable = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

    // Operator flips role off again — generator must stop polling on next tick.
    roles = ['solving'];
    await gen();
    expect((fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterEnable);
  });

  it('absent getRoles defaults to ungated (back-compat for callers that do not pass it)', async () => {
    // If no role-getter is provided, the generator polls — preserves the
    // existing public API for the parse/registry tests that build the
    // generator directly without the hot-spawn wiring.
    const fetchSpy = vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const gen = makePredictionV1Generator({
      fetchImpl: fetchSpy,
      cadenceMs: 0,
    });
    await gen();
    expect((fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });
});
