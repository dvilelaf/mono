import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SetupFlow } from './SetupFlow.js';

const defaults = {
  cadenceMs: 21_600_000, // 6h
  maxNewRoundsPerPoll: 5,
  maxNewRoundsPerDay: 100,
  maxOpenRounds: 250,
};

describe('SetupFlow', () => {
  afterEach(() => {
    cleanup();
  });

  it('walks through 4 steps and patches launcher config on Save', async () => {
    const onPatch = vi
      .fn()
      .mockResolvedValue({ ok: true, name: 'prediction', roles: ['launching'], generator: defaults });
    const onComplete = vi.fn();
    render(
      <SetupFlow
        netName="prediction"
        defaults={defaults}
        safeBalanceWei="1000000000000000000"
        onPatch={onPatch}
        onComplete={onComplete}
      />,
    );

    // Step 1: confirm SolverNet — Prediction lede.
    expect(screen.getByText(/Calibrated probabilistic forecasts/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Step 2: confirm generator defaults.
    expect(screen.getByText(/cadence: 360 min/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Step 3: budget plan.
    expect(screen.getByText(/funds approximately/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Step 4: confirm + save.
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() =>
      expect(onPatch).toHaveBeenCalledWith('prediction', {
        launching: true,
        generator: defaults,
      }),
    );
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('Back button returns to the previous step', () => {
    render(
      <SetupFlow
        netName="prediction"
        defaults={defaults}
        safeBalanceWei="1000000000000000000"
        onPatch={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByText(/Calibrated probabilistic forecasts/i)).toBeTruthy();
  });

  it('renders the error from a failing onPatch and does NOT fire onComplete', async () => {
    const onPatch = vi.fn().mockRejectedValue(new Error('boom'));
    const onComplete = vi.fn();
    render(
      <SetupFlow
        netName="prediction"
        defaults={defaults}
        safeBalanceWei="1000000000000000000"
        onPatch={onPatch}
        onComplete={onComplete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() => expect(screen.getByText(/boom/i)).toBeTruthy());
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not show a Back button on the first step', () => {
    render(
      <SetupFlow
        netName="prediction"
        defaults={defaults}
        safeBalanceWei="1000000000000000000"
        onPatch={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Back/i })).toBeNull();
  });
});
