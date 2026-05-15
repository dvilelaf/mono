/**
 * Unit tests for the Onboarding phase state machine.
 *
 * Tests for statusFor() — the function that determines whether a phase row
 * is 'done', 'active', or 'queued'. The key invariant (jinn-mono-hjex.7):
 *
 *   Phase 3 ("Fund your wallet") must stay 'active' until the funding gate
 *   is cleared, even when currentPhase has already advanced to 4. A single
 *   drip that briefly crossed the threshold must not flip phase 3 to DONE.
 */
import { describe, expect, it } from 'vitest';
import { statusFor } from './Onboarding.js';

describe('statusFor phase machine (jinn-mono-hjex.7)', () => {
  // ── Baseline: no funding context ─────────────────────────────────────────

  it('marks earlier phases as done when currentPhase advances', () => {
    expect(statusFor(1, 3)).toBe('done');
    expect(statusFor(2, 4)).toBe('done');
  });

  it('marks the current phase as active', () => {
    expect(statusFor(3, 3)).toBe('active');
    expect(statusFor(4, 4)).toBe('active');
  });

  it('marks later phases as queued', () => {
    expect(statusFor(4, 2)).toBe('queued');
    expect(statusFor(3, 2)).toBe('queued');
  });

  // ── Phase 3 funding gate ─────────────────────────────────────────────────

  it('marks phase 3 done when currentPhase > 3 and fundingTargetMet is absent (gate cleared)', () => {
    // fundingTargetMet === undefined means no funding block in response — gate cleared
    expect(statusFor(3, 4, undefined)).toBe('done');
  });

  it('does not mark phase 3 DONE while funding.targetMet is false (jinn-mono-hjex.7)', () => {
    // Explicit false: gate is still open even though step advanced
    expect(statusFor(3, 4, false)).toBe('active');
  });

  it('marks phase 3 DONE when currentPhase > 3 and fundingTargetMet is true', () => {
    expect(statusFor(3, 4, true)).toBe('done');
  });

  it('does not apply the funding gate hold to phases other than 3', () => {
    // Phase 2 done even if fundingTargetMet is false — gate is only for phase 3
    expect(statusFor(2, 4, false)).toBe('done');
    // Phase 1 done regardless
    expect(statusFor(1, 4, false)).toBe('done');
  });

  it('marks phase 3 active (not queued) when it is the current phase, regardless of funding', () => {
    expect(statusFor(3, 3, false)).toBe('active');
    expect(statusFor(3, 3, undefined)).toBe('active');
  });

  it('phase 4 queued is unaffected by fundingTargetMet', () => {
    expect(statusFor(4, 3, false)).toBe('queued');
    expect(statusFor(4, 3, true)).toBe('queued');
  });
});
