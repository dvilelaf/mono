/**
 * First-run disclaimer — unit tests for maybePrintDisclaimer (Task 8.2).
 *
 * Verifies that the canonical disclaimer is printed on first run and that
 * the acknowledgement marker file is written to suppress subsequent prints.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { maybePrintDisclaimer } from '../../src/cli/commands/run.js';
import { CANONICAL_DISCLAIMER } from '../../src/network-trust/disclaimer.js';

let TMP: string;

beforeEach(() => {
  TMP = mkdtempSync(join(tmpdir(), 'jinn-disclaimer-'));
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('maybePrintDisclaimer', () => {
  it('prints the canonical disclaimer on first run and writes the marker', () => {
    const stderrLines: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrLines.push(String(chunk));
      return true;
    });

    try {
      maybePrintDisclaimer(TMP);
    } finally {
      spy.mockRestore();
    }

    // Disclaimer text must appear in stderr output.
    const combined = stderrLines.join('');
    expect(combined).toContain(
      'The Jinn daemon runs an autonomous learning agent',
    );
    expect(combined).toContain(CANONICAL_DISCLAIMER.slice(0, 60));

    // Marker file must be written.
    const markerPath = join(TMP, '.jinn-client', 'disclaimer-acknowledged');
    expect(existsSync(markerPath)).toBe(true);
  });

  it('does NOT print the canonical disclaimer when marker exists', () => {
    // Pre-write the marker.
    mkdirSync(join(TMP, '.jinn-client'), { recursive: true });
    writeFileSync(
      join(TMP, '.jinn-client', 'disclaimer-acknowledged'),
      `${new Date().toISOString()}\n`,
    );

    const stderrLines: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrLines.push(String(chunk));
      return true;
    });

    try {
      maybePrintDisclaimer(TMP);
    } finally {
      spy.mockRestore();
    }

    const combined = stderrLines.join('');
    expect(combined).not.toContain('The Jinn daemon runs an autonomous learning agent');
  });

  it('writes the marker file with an ISO timestamp', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      maybePrintDisclaimer(TMP);
    } finally {
      spy.mockRestore();
    }

    const markerPath = join(TMP, '.jinn-client', 'disclaimer-acknowledged');
    const content = require('node:fs').readFileSync(markerPath, 'utf8').trim();
    // Content must be parseable as an ISO date.
    expect(new Date(content).toISOString()).toBeDefined();
    expect(() => new Date(content).toISOString()).not.toThrow();
  });
});
