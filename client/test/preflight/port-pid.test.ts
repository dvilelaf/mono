import { describe, expect, it } from 'vitest';
import {
  formatUptime,
  parseEtime,
  parseLsofOutput,
  parseSsOutput,
} from '../../src/preflight/port-pid.js';

describe('port-pid parsers (jinn-mono-hjex.5)', () => {
  describe('parseEtime', () => {
    it('parses MM:SS', () => {
      expect(parseEtime('02:30')).toBe(150); // 2m30s
      expect(parseEtime('00:00')).toBe(0);
      expect(parseEtime('59:59')).toBe(59 * 60 + 59);
    });

    it('parses HH:MM:SS', () => {
      expect(parseEtime('01:00:00')).toBe(3600);
      expect(parseEtime('02:03:04')).toBe(2 * 3600 + 3 * 60 + 4);
    });

    it('parses DD-HH:MM:SS', () => {
      // 1d4h: 24*3600 + 4*3600 = 100800
      expect(parseEtime('01-04:00:00')).toBe(100800);
      // 0 days, 5h, 6m, 7s
      expect(parseEtime('00-05:06:07')).toBe(5 * 3600 + 6 * 60 + 7);
    });

    it('tolerates leading/trailing whitespace', () => {
      expect(parseEtime('   02:30   ')).toBe(150);
    });

    it('returns null on garbage', () => {
      expect(parseEtime('not-a-time')).toBe(null);
      expect(parseEtime('1:2:3:4')).toBe(null);
      expect(parseEtime('')).toBe(null);
    });
  });

  describe('parseLsofOutput', () => {
    it('parses a known -F pcu fixture (single holder)', () => {
      // lsof -F pcu output: one block per process; fields prefixed by
      // 'p' (pid), 'c' (command), 'u' (uid). A blank line separates blocks.
      const fixture = ['p19958', 'cnode', 'u501', ''].join('\n');
      const result = parseLsofOutput(fixture);
      expect(result).not.toBeNull();
      expect(result!.pid).toBe(19958);
      expect(result!.command).toBe('node');
      // uptimeSeconds may be null (no /proc, ps unavailable, or PID gone) —
      // we don't pin it.
    });

    it('parses output with trailing whitespace in command', () => {
      const fixture = ['p42', 'cjinn run\t', 'u501'].join('\n');
      const result = parseLsofOutput(fixture);
      expect(result).not.toBeNull();
      expect(result!.pid).toBe(42);
      expect(result!.command).toBe('jinn run');
    });

    it('returns null on empty output', () => {
      expect(parseLsofOutput('')).toBeNull();
      expect(parseLsofOutput('   \n  ')).toBeNull();
    });

    it('returns null when -F output lacks p+c pair', () => {
      // 'u' field but no 'p' or 'c' — incomplete record.
      expect(parseLsofOutput('u501\n')).toBeNull();
      // 'p' alone — no command.
      expect(parseLsofOutput('p12345\nu501\n')).toBeNull();
    });

    it('returns null on non-numeric PID', () => {
      expect(parseLsofOutput('pnotanumber\ncnode\n')).toBeNull();
    });
  });

  describe('parseSsOutput', () => {
    it('parses a known ss -lntp fixture', () => {
      // First line is the header from ss, second line is the entry.
      const fixture = [
        'State    Recv-Q   Send-Q   Local Address:Port   Peer Address:Port   Process',
        'LISTEN   0        128      0.0.0.0:7331         0.0.0.0:*           users:(("node",pid=12345,fd=20))',
      ].join('\n');
      const result = parseSsOutput(fixture);
      expect(result).not.toBeNull();
      expect(result!.pid).toBe(12345);
      expect(result!.command).toBe('node');
    });

    it('parses a holder with a multi-word command name', () => {
      const fixture =
        'LISTEN 0 128 0.0.0.0:7331 0.0.0.0:* users:(("jinn-client",pid=42,fd=20))';
      const result = parseSsOutput(fixture);
      expect(result).not.toBeNull();
      expect(result!.pid).toBe(42);
      expect(result!.command).toBe('jinn-client');
    });

    it('returns null when no users:() block is present', () => {
      const fixture = 'LISTEN 0 128 0.0.0.0:7331 0.0.0.0:*';
      expect(parseSsOutput(fixture)).toBeNull();
    });

    it('returns null on empty output', () => {
      expect(parseSsOutput('')).toBeNull();
    });
  });

  describe('formatUptime round-trip', () => {
    it('round-trips with parseEtime for MM:SS', () => {
      // 12 minutes
      expect(formatUptime(parseEtime('12:34')!)).toBe('12m');
    });

    it('round-trips with parseEtime for HH:MM:SS', () => {
      // 2h3m
      expect(formatUptime(parseEtime('02:03:04')!)).toBe('2h3m');
    });

    it('round-trips with parseEtime for DD-HH:MM:SS', () => {
      // 1d4h
      expect(formatUptime(parseEtime('01-04:00:00')!)).toBe('1d4h');
    });

    it('drops sub-minute granularity', () => {
      expect(formatUptime(30)).toBe('0m');
    });
  });
});
