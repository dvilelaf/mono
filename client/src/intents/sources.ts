import type { Task } from '../types/desired-state.js';

/** Returns a freshly-built Task for this tick, or null to skip. */
export type IntentGenerator = () => Promise<Task | null>;

export type IntentPostingPolicy =
  | { kind: 'once_per_safe' }
  | { kind: 'once_per_bucket'; bucketKey: string }
  | { kind: 'interval'; intervalMs: number; scopeKey?: string };

export interface IntentCandidate {
  task: Task;
  sourceKey: string;
  postingPolicy: IntentPostingPolicy;
  /**
   * IPFS CID of the signed intent document, if already uploaded by the caller
   * (e.g. `jinn submit-intent --spec-file`). When present, the posting service
   * uses it to register the intent on the ERC-8004 Identity Registry after a
   * successful on-chain post (best-effort, Plan E).
   */
  taskCid?: string;
  sourceMeta?: {
    solverType?: string;
    bucketKey?: string;
    note?: string;
  };
}

export interface IntentSource {
  sourceKey: string;
  collect(now: Date): Promise<IntentCandidate[]>;
}

export class StaticConfiguredIntentSource implements IntentSource {
  readonly sourceKey = 'configured';

  constructor(private readonly desiredStates: Task[]) {}

  async collect(_now: Date): Promise<IntentCandidate[]> {
    return this.desiredStates.map((task) => ({
      task,
      sourceKey: `${this.sourceKey}:${task.id}`,
      postingPolicy: { kind: 'once_per_safe' },
      sourceMeta: { solverType: task.solverType, note: 'configured' },
    }));
  }
}

export class GeneratedIntentSource implements IntentSource {
  constructor(
    readonly sourceKey: string,
    private readonly generator: IntentGenerator,
  ) {}

  async collect(_now: Date): Promise<IntentCandidate[]> {
    const task = await this.generator();
    if (!task) return [];
    const bucketKey = task.window
      ? `${task.window.startTs}:${task.window.endTs}`
      : task.id;
    return [{
      task,
      sourceKey: this.sourceKey,
      postingPolicy: { kind: 'once_per_bucket', bucketKey },
      sourceMeta: {
        solverType: task.solverType,
        bucketKey,
        note: 'generated',
      },
    }];
  }
}
