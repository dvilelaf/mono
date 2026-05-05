/**
 * PlugInAttestation JSON schema validator.
 *
 * Schema: schemas/plug-in-attestation-v1.json
 * Spec: spec/2026-05-05-plug-in-and-harness-network-trust.md §8.1
 */

import { createRequire } from 'node:module';
import { Ajv2020 } from 'ajv/dist/2020.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const schema = require('../../schemas/plug-in-attestation-v1.json') as Record<string, any>;

const ajv = new Ajv2020({ strict: true });
const _validate = ajv.compile(schema);

export type PlugInAttestation = {
  subject: string;
  subjectType: 'plug-in' | 'harness';
  version: string;
  manifestHash: string;
  tarballHash: string;
  tier: 0 | 1 | 2 | 3;
  kind: 'installed' | 'endorse' | 'warn' | 'block' | 'review';
  score: -2 | -1 | 0 | 1;
  reason: string;
  reviewCid: string;
  attestedAt: number;
};

export function validatePlugInAttestation(value: unknown): value is PlugInAttestation {
  return _validate(value) === true;
}
