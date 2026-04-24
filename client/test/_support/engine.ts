import {
  RestorationEngine,
  NotImplementedError,
  type RestorationEngineOptions,
  type RestorerImplRegistry,
} from '@/restorer/engine/engine.js';
import {
  IntentPersistence,
  type PersistedIntent,
  type PersistedIntentInput,
} from '@/restorer/engine/persistence.js';
import type { Store } from '@/store/store.js';

const NOOP_REGISTRY: RestorerImplRegistry = { resolveImplName: () => null };

let counter = 0;
function nextId(): string { return `req-${++counter}`; }

/**
 * Canonical fixture replacing the ~5 ad-hoc `makeInput` helpers across engine tests.
 * Signature drift (`makeInput(overrides)` vs `makeInput(id, overrides)` vs
 * `makeInput(id='req-gate')`) is collapsed into one shape.
 */
export function makeIntentInput(
  overrides: Partial<PersistedIntentInput> = {},
): PersistedIntentInput {
  const id = overrides.requestId ?? nextId();
  const now = Date.now();
  return {
    requestId: id,
    intentCid: `bafycid-${id}`,
    onchainCreationTx: '0xdeadbeef',
    onchainCreationBlock: 1000,
    specKind: 'portfolio.v0',
    windowStartTs: now + 60_000,
    windowEndTs: now + 60_000 + 86_400_000,
    desiredState: { id, description: 'test' },
    ...overrides,
  };
}

/**
 * A thin subclass of IntentPersistence that overrides `insertDiscovered` to
 * return the newly-inserted PersistedIntent (the base class returns void).
 * This makes test assertions on the inserted row ergonomic without calling
 * `getOrThrow` separately.
 */
class TestPersistence extends IntentPersistence {
  insertDiscovered(input: PersistedIntentInput): PersistedIntent {
    super.insertDiscovered(input);
    return this.getOrThrow(input.requestId);
  }
}

export interface StateMachineSpyOpts {
  store: Store;
  paths?: { workingDirRoot: string; implStateDirRoot: string };
  onClaim?(intent: PersistedIntent): Promise<void>;
  onPreSnapshot?(intent: PersistedIntent): Promise<void>;
  onRunImpl?(intent: PersistedIntent): Promise<void>;
  onPostSnapshot?(intent: PersistedIntent): Promise<void>;
  onPack?(intent: PersistedIntent): Promise<void>;
  onDeliver?(intent: PersistedIntent): Promise<void>;
}

export interface StateMachineSpy {
  engine: SpyEngine;
  calls: string[];
  callsByIntent: Map<string, string[]>;
}

class SpyEngine extends RestorationEngine {
  readonly calls: string[] = [];
  readonly callsByIntent: Map<string, string[]> = new Map();
  private readonly spyOpts: StateMachineSpyOpts;

  // Typed accessor that exposes the TestPersistence subclass
  readonly testPersistence: TestPersistence;

  constructor(opts: StateMachineSpyOpts) {
    // We need store.db for TestPersistence, so build opts first then pass to super.
    // The base class constructs IntentPersistence from opts.store.db; we shadow it.
    super({
      store: opts.store,
      registry: NOOP_REGISTRY,
      paths: opts.paths ?? { workingDirRoot: '/tmp/work', implStateDirRoot: '/tmp/impl' },
    });
    this.spyOpts = opts;
    // Replace the protected persistence with our TestPersistence subclass so
    // insertDiscovered returns the row. We cast through unknown to write to the
    // protected field from outside the class body. This is intentional test
    // infrastructure — it avoids modifying production source files.
    const tp = new TestPersistence(opts.store.db);
    (this as unknown as { persistence: TestPersistence }).persistence = tp;
    this.testPersistence = tp;
  }

  private record(intent: PersistedIntent, name: string): void {
    this.calls.push(name);
    const list = this.callsByIntent.get(intent.requestId) ?? [];
    list.push(name);
    this.callsByIntent.set(intent.requestId, list);
  }

  override async claim(intent: PersistedIntent): Promise<void> {
    this.record(intent, 'claim');
    if (this.spyOpts.onClaim) return this.spyOpts.onClaim(intent);
    throw new NotImplementedError('claim');
  }
  override async takePreSnapshot(intent: PersistedIntent): Promise<void> {
    this.record(intent, 'takePreSnapshot');
    if (this.spyOpts.onPreSnapshot) return this.spyOpts.onPreSnapshot(intent);
    throw new NotImplementedError('takePreSnapshot');
  }
  override async runImpl(intent: PersistedIntent): Promise<void> {
    this.record(intent, 'runImpl');
    if (this.spyOpts.onRunImpl) return this.spyOpts.onRunImpl(intent);
    throw new NotImplementedError('runImpl');
  }
  override async takePostSnapshot(intent: PersistedIntent): Promise<void> {
    this.record(intent, 'takePostSnapshot');
    if (this.spyOpts.onPostSnapshot) return this.spyOpts.onPostSnapshot(intent);
    throw new NotImplementedError('takePostSnapshot');
  }
  override async pack(intent: PersistedIntent): Promise<void> {
    this.record(intent, 'pack');
    if (this.spyOpts.onPack) return this.spyOpts.onPack(intent);
    throw new NotImplementedError('pack');
  }
  override async deliver(intent: PersistedIntent): Promise<void> {
    this.record(intent, 'deliver');
    if (this.spyOpts.onDeliver) return this.spyOpts.onDeliver(intent);
    throw new NotImplementedError('deliver');
  }
}

/** Canonical spy engine replacing the ad-hoc TestEngine/SpyEngine subclasses in 5 test files. */
export function createStateMachineSpy(opts: StateMachineSpyOpts): StateMachineSpy {
  const engine = new SpyEngine(opts);
  return { engine, calls: engine.calls, callsByIntent: engine.callsByIntent };
}
