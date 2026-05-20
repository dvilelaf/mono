import { describe, it, expect } from 'vitest';
import {
  EVENT_KIND_META,
  LIFECYCLE_KINDS,
  eventKindMeta,
  toneColor,
} from './event-kinds.js';

// The daemon's LifecycleKind union (src/observability/emit-event.ts). The SPA
// cannot import daemon source across the build boundary, so it duplicates the
// list — this hard-coded expectation is the parity anchor.
const EXPECTED_DAEMON_KINDS = [
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
];

describe('event-kinds', () => {
  it('exposes exactly the 14 daemon lifecycle kinds (parity with emit-event.ts)', () => {
    expect([...LIFECYCLE_KINDS].sort()).toEqual([...EXPECTED_DAEMON_KINDS].sort());
  });

  it('every lifecycle kind has a non-empty label and description', () => {
    for (const kind of LIFECYCLE_KINDS) {
      const meta = EVENT_KIND_META[kind];
      expect(meta, `meta missing for ${kind}`).toBeTruthy();
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  it('never renders a raw snake_case kind as the primary label', () => {
    for (const kind of LIFECYCLE_KINDS) {
      expect(EVENT_KIND_META[kind].label).not.toContain('_');
    }
  });

  it('falls back gracefully for an unknown kind without exposing raw snake_case', () => {
    const meta = eventKindMeta('some_unknown_future_kind');
    expect(meta.label).not.toContain('_');
    expect(meta.label.length).toBeGreaterThan(0);
    expect(meta.description.length).toBeGreaterThan(0);
  });

  it('eventKindMeta returns the canonical entry for a known kind', () => {
    expect(eventKindMeta('reward_claimed')).toBe(EVENT_KIND_META.reward_claimed);
  });

  it('maps every tone to a CSS custom property', () => {
    const tones = ['info', 'success', 'reward', 'error', 'neutral'] as const;
    for (const tone of tones) {
      expect(toneColor(tone)).toMatch(/^var\(--/);
    }
  });
});
