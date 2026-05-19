import { createServer } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { apiPortFailureMessage, checkApiPortAvailable } from '../../src/preflight/api-port.js';

describe('api port preflight', () => {
  it('reports an occupied port before daemon startup', async () => {
    const holder = createServer();
    await new Promise<void>((resolve) => holder.listen(0, '0.0.0.0', () => resolve()));
    const addr = holder.address();
    if (!addr || typeof addr === 'string') throw new Error('missing address');
    try {
      const result = await checkApiPortAvailable(addr.port);
      expect(result).toMatchObject({ ok: false, port: addr.port, code: 'EADDRINUSE' });
      if (!result.ok) {
        expect(apiPortFailureMessage(result)).toContain(String(addr.port));
      }
    } finally {
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  });

  // ── jinn-mono-hjex.5: EADDRINUSE error envelope names the PID ─────────────

  it('includes holder PID in EADDRINUSE failure message when portPidLookup returns a holder (jinn-mono-hjex.5)', async () => {
    const holder = createServer();
    await new Promise<void>((resolve) => holder.listen(0, '0.0.0.0', () => resolve()));
    const addr = holder.address();
    if (!addr || typeof addr === 'string') throw new Error('missing address');

    const fakeHolder = { pid: 19958, command: 'jinn run', uptimeSeconds: 104400 };
    const fakeLookup = vi.fn().mockResolvedValue(fakeHolder);

    try {
      const result = await checkApiPortAvailable(addr.port, fakeLookup);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.holder).toEqual(fakeHolder);
        const msg = apiPortFailureMessage(result);
        expect(msg).toContain('19958');
        expect(msg).toContain('jinn run');
        expect(msg).toContain('jinn stop --force');
      }
    } finally {
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  });

  it('falls back to generic message when portPidLookup returns null (jinn-mono-hjex.5)', async () => {
    const holder = createServer();
    await new Promise<void>((resolve) => holder.listen(0, '0.0.0.0', () => resolve()));
    const addr = holder.address();
    if (!addr || typeof addr === 'string') throw new Error('missing address');

    const fakeLookup = vi.fn().mockResolvedValue(null);

    try {
      const result = await checkApiPortAvailable(addr.port, fakeLookup);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.holder).toBeUndefined();
        const msg = apiPortFailureMessage(result);
        expect(msg).toContain(String(addr.port));
        expect(msg).toContain('jinn stop');
      }
    } finally {
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  });

  it('falls back to generic message when portPidLookup rejects (jinn-mono-hjex.5)', async () => {
    const holder = createServer();
    await new Promise<void>((resolve) => holder.listen(0, '0.0.0.0', () => resolve()));
    const addr = holder.address();
    if (!addr || typeof addr === 'string') throw new Error('missing address');

    const fakeLookup = vi.fn().mockRejectedValue(new Error('lsof not found'));

    try {
      const result = await checkApiPortAvailable(addr.port, fakeLookup);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.holder).toBeUndefined();
        const msg = apiPortFailureMessage(result);
        expect(msg).toContain(String(addr.port));
      }
    } finally {
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  });

  it('includes uptime in the PID failure message when uptimeSeconds is known (jinn-mono-hjex.5)', async () => {
    const holder = createServer();
    await new Promise<void>((resolve) => holder.listen(0, '0.0.0.0', () => resolve()));
    const addr = holder.address();
    if (!addr || typeof addr === 'string') throw new Error('missing address');

    // 1d4h = 24*3600 + 4*3600 = 100800 seconds
    const fakeHolder = { pid: 42, command: 'node', uptimeSeconds: 100800 };
    const fakeLookup = vi.fn().mockResolvedValue(fakeHolder);

    try {
      const result = await checkApiPortAvailable(addr.port, fakeLookup);
      if (!result.ok) {
        const msg = apiPortFailureMessage(result);
        expect(msg).toContain('1d4h');
      }
    } finally {
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  });
});
