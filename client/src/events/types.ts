import { z } from 'zod';

export const StructuredEventKindSchema = z.enum([
  'intent',
  'reward',
  'fleet',
  'system',
  'error',
  'log',
]);
export type StructuredEventKind = z.infer<typeof StructuredEventKindSchema>;

export const StructuredEventSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  ts: z.string(),
  kind: StructuredEventKindSchema,
  message: z.string(),
  requestId: z.string().optional(),
  txHash: z.string().optional(),
  errorCode: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type StructuredEvent = z.infer<typeof StructuredEventSchema>;
