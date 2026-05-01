/**
 * HarnessRegistry — impl registration + operator-config-aware dispatch.
 *
 * §6.7 of spec/2026-04-17-portfolio-v0-design.md
 *
 * Dispatch priority:
 *   1. bySolverType[task.solverType] — explicit operator mapping wins regardless of
 *      registration order
 *   2. config.default — named fallback impl
 *   3. First-match — iterate registered impls, return first whose supports()
 *      returns true
 *
 * Disabled impls (config.disabled[]) are filtered out before dispatch.
 */

import type { Harness } from '../types.js';
import type { ImplRegistry } from './engine.js';

// ── Operator config schema ─────────────────────────────────────────────────────

export interface HarnessDispatchConfig {
  /**
   * Explicit solverType → Harness name mapping.
   * e.g. { "portfolio.v0": "claude-mcp-hyperliquid" }
   */
  bySolverType?: Record<string, string>;
  /**
   * Fallback impl name when no solverType-specific match is found.
   */
  default?: string;
  /**
   * Impl names to exclude from dispatch entirely.
   */
  disabled?: string[];
}

// ── HarnessRegistry ──────────────────────────────────────────────────────

export class HarnessRegistry implements ImplRegistry {
  private readonly impls: Harness[] = [];
  private readonly config: HarnessDispatchConfig;

  constructor(config: HarnessDispatchConfig = {}) {
    this.config = config;
  }

  /**
   * Register an impl. Later registrations appear later in the list for
   * first-match fallback dispatch.
   */
  register(impl: Harness): void {
    this.impls.push(impl);
  }

  /**
   * Find the Harness to use for the given solverType, applying operator config
   * dispatch rules.
   *
   * Returns undefined if no suitable impl is found (all disabled, none
   * support the kind, or registry is empty).
   */
  findFor(ctx: { solverType: string; role?: 'restoration' | 'evaluation' }): Harness | undefined {
    const disabled = new Set(this.config.disabled ?? []);
    const active = this.impls.filter((impl) => !disabled.has(impl.name));

    // 1. bySolverType explicit mapping — but ONLY honor it if the named impl supports
    //    the requested ctx. Otherwise fall through (e.g., bySolverType points at the
    //    harness impl, but ctx asks for an evaluation).
    const kindName = this.config.bySolverType?.[ctx.solverType];
    if (kindName) {
      const named = active.find((impl) => impl.name === kindName);
      if (named && named.supports(ctx)) return named;
    }

    // 2. default fallback name
    if (this.config.default) {
      const defaultImpl = active.find((impl) => impl.name === this.config.default);
      if (defaultImpl && defaultImpl.supports(ctx)) {
        return defaultImpl;
      }
    }

    // 3. First-match by supports()
    return active.find((impl) => impl.supports(ctx));
  }

  /** All registered impls (including disabled ones). */
  list(): Harness[] {
    return [...this.impls];
  }
}
