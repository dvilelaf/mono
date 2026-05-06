/**
 * `jinn checkpoint publish` / `install` / `list` — HarnessCheckpoint
 * lifecycle CLI verbs.
 *
 * Spec: docs/superpowers/specs/2026-05-06-agent-harness-solvernet-design.md §7
 */

import { HarnessCheckpointManifestSchema, type HarnessCheckpointManifest } from '@jinn-network/sdk/checkpoint';

export interface CheckpointPublishDeps {
  pinToIpfs(args: { kind: 'sourceBundle' | 'implStateDir' | 'manifest'; data: Buffer | string }): Promise<string>;
  callSetMetadata(args: { metadataKey: string; payload: string }): Promise<{ txHash: string; blockNumber: number }>;
  hashImplStateDir(dirPath: string): Promise<string>;
  sign(canonicalJson: string): Promise<string>;
  getSigningIdentity(): Promise<{
    agentId: string;
    signingKey: string;
    safeAddress: string;
  }>;
}

export async function checkpointPublishCommand(args: {
  name: string;
  version: string;
  implStateDir: string;
  sourceBundleCid: string;
  implName: string;
  implVersion: string;
  clientGitSha: string;
  parentCheckpointCid?: string | null;
  deps: CheckpointPublishDeps;
}): Promise<{ checkpointCid: string; manifest: HarnessCheckpointManifest }> {
  const codeDigest = `sha256:${await args.deps.hashImplStateDir(args.implStateDir)}`;
  const implStateDirCid = await args.deps.pinToIpfs({ kind: 'implStateDir', data: '' });
  const publisher = await args.deps.getSigningIdentity();

  const core = {
    schemaVersion: 'harness.checkpoint.v1' as const,
    name: args.name,
    version: args.version,
    parentCheckpointCid: args.parentCheckpointCid ?? null,
    harnessPackage: {
      implName: args.implName,
      implVersion: args.implVersion,
      clientGitSha: args.clientGitSha,
      sourceBundleCid: args.sourceBundleCid,
    },
    implStateDirCid,
    codeDigest,
    publisher,
    publishedAt: new Date().toISOString(),
  };

  const canonicalJson = canonicalize(core);
  const signature = await args.deps.sign(canonicalJson);

  const manifestPayload = JSON.stringify({ ...core, signature, registry: null });
  const manifestPinCid = await args.deps.pinToIpfs({ kind: 'manifest', data: manifestPayload });
  const tx = await args.deps.callSetMetadata({
    metadataKey: `harness.checkpoint:${manifestPinCid}`,
    payload: manifestPinCid,
  });

  const final: HarnessCheckpointManifest = {
    ...core,
    signature,
    registry: {
      anchor: 'IdentityRegistry.setMetadata',
      metadataKey: `harness.checkpoint:${manifestPinCid}`,
      txHash: tx.txHash as `0x${string}`,
      blockNumber: tx.blockNumber,
    },
  };

  HarnessCheckpointManifestSchema.parse(final);

  return { checkpointCid: manifestPinCid, manifest: final };
}

function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalize).join(',')}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((obj as any)[k])}`).join(',')}}`;
}
