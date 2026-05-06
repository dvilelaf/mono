import type { Task } from '../../types/index.js';
import type { SolverNetPrecondition } from '@jinn-network/sdk/solvernets';
import { getResolution } from '../../venues/polymarket/client.js';

export type PreconditionContext = {
  task: Task;
};

export type PreconditionResolution =
  | { ok: true }
  | { ok: false; reason: string };

export type PreconditionResolver = (
  precondition: SolverNetPrecondition,
  ctx: PreconditionContext,
) => Promise<PreconditionResolution>;

/**
 * Registry of precondition kinds → resolvers. The evaluator path's prefilter
 * dispatches by `precondition.kind`; each resolver knows how to interpret
 * its `source` template and return ok/not-ok against the live world.
 *
 * New kinds (e.g. `attestation.eas`, `contract.read.v1`) plug in here
 * without adapter changes.
 */
export class PreconditionResolverRegistry {
  private resolvers = new Map<string, PreconditionResolver>();

  register(kind: string, resolver: PreconditionResolver): this {
    this.resolvers.set(kind, resolver);
    return this;
  }

  has(kind: string): boolean {
    return this.resolvers.has(kind);
  }

  async resolve(
    precondition: SolverNetPrecondition,
    ctx: PreconditionContext,
  ): Promise<PreconditionResolution> {
    const resolver = this.resolvers.get(precondition.kind);
    if (!resolver) {
      return {
        ok: false,
        reason: `no resolver registered for precondition kind '${precondition.kind}'`,
      };
    }
    try {
      return await resolver(precondition, ctx);
    } catch (err) {
      return {
        ok: false,
        reason: `resolver '${precondition.kind}' threw: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  /**
   * Resolve every precondition in order. Returns ok on first failure
   * (short-circuit). Empty array → ok.
   */
  async checkAll(
    preconditions: readonly SolverNetPrecondition[],
    ctx: PreconditionContext,
  ): Promise<PreconditionResolution> {
    for (const p of preconditions) {
      const r = await this.resolve(p, ctx);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
}

/**
 * Resolve a `${task.spec.foo.bar}` placeholder against the Task body. Used
 * by resolvers to interpret their `source` field. Returns the raw resolved
 * value; resolvers cast / interpret as needed for their domain.
 */
export function interpolateSource(template: string, task: Task): string {
  // If the entire string is a single ${...} placeholder, resolve and return
  // as a string. If the template contains literal text mixed with
  // placeholders, do simple substitution.
  return template.replace(/\$\{([^}]+)\}/gu, (_match, path: string) => {
    const segments = path.replace(/^task\./u, '').split('.');
    let cursor: unknown = task;
    for (const seg of segments) {
      if (cursor && typeof cursor === 'object' && seg in (cursor as Record<string, unknown>)) {
        cursor = (cursor as Record<string, unknown>)[seg];
      } else {
        throw new Error(`precondition source path '${path}' did not resolve on task`);
      }
    }
    return String(cursor);
  });
}

/**
 * Polymarket resolution-status resolver. Wraps `getResolution` from the
 * polymarket client. Maps `status: 'resolved'` → ok; everything else → not-ok
 * with a descriptive reason.
 *
 * The precondition's `source` is the market URL (templated), e.g.
 * `${task.spec.source.url}`. The resolver passes it as `sourceUrl` to the
 * polymarket client, which extracts a slug/marketId.
 */
export function createPolymarketResolutionResolver(deps: {
  getResolution: typeof getResolution;
}): PreconditionResolver {
  return async (precondition, ctx) => {
    const sourceUrl = interpolateSource(precondition.source, ctx.task);
    const snapshot = await deps.getResolution({ sourceUrl });
    if (snapshot.status === precondition.expects) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `polymarket resolution status='${snapshot.status}' (expected '${precondition.expects}'); url=${sourceUrl}`,
    };
  };
}

/**
 * Create the default registry wiring the polymarket resolution resolver.
 * Tests can override `deps.getResolution` to control market state without
 * hitting the network.
 */
export function createDefaultPreconditionRegistry(deps?: {
  getResolution?: typeof getResolution;
}): PreconditionResolverRegistry {
  const registry = new PreconditionResolverRegistry();
  registry.register(
    'oracle.polymarket.resolution',
    createPolymarketResolutionResolver({ getResolution: deps?.getResolution ?? getResolution }),
  );
  return registry;
}
