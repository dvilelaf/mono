import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GeneratorConfigSection, type GeneratorConfig } from './GeneratorConfigSection.js';

const fixture: GeneratorConfig = {
  cadenceMs: 21_600_000,
  maxNewRoundsPerPoll: 5,
  maxNewRoundsPerDay: 100,
  maxOpenRounds: 250,
  allowlistConditionIds: [],
  blocklistConditionIds: [],
  windowMs: 86_400_000,
  resolveGapMs: 3_600_000,
};

describe('GeneratorConfigSection', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders all 8 generator fields', () => {
    render(<GeneratorConfigSection netName="prediction" config={fixture} onSave={vi.fn()} />);
    expect(screen.queryByLabelText(/^Cadence$/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Max new rounds per poll/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Max new rounds per day/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Max open rounds/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Allowlist/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Blocklist/i)).toBeTruthy();
    expect(screen.queryByLabelText(/^Window$/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Resolve gap/i)).toBeTruthy();
  });

  it('calls onSave with the generator-shaped patch containing only changed fields', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<GeneratorConfigSection netName="prediction" config={fixture} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/^Cadence$/i), { target: { value: '120000' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        generator: { cadenceMs: 120_000 },
      }),
    );
  });

  it('save button disabled when no fields changed', () => {
    render(<GeneratorConfigSection netName="prediction" config={fixture} onSave={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /Save/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('parses comma-separated allowlist into an array', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<GeneratorConfigSection netName="prediction" config={fixture} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/Allowlist/i), {
      target: { value: '0xabc, 0xdef , 0x123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        generator: { allowlistConditionIds: ['0xabc', '0xdef', '0x123'] },
      }),
    );
  });

  it('renders error message when onSave rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('boom'));
    render(<GeneratorConfigSection netName="prediction" config={fixture} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/^Cadence$/i), { target: { value: '120000' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(screen.queryByText(/boom/)).toBeTruthy());
  });
});
