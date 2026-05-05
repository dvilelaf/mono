import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState.js';

describe('EmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the spec headline and the framing copy', () => {
    render(<EmptyState onLaunch={vi.fn()} />);
    expect(screen.getByText("You haven't launched a SolverNet yet.")).toBeTruthy();
    // Knowledge-direction framing — the "what is a SolverNet" lede.
    expect(screen.getByText(/directs the network's effort/i)).toBeTruthy();
  });

  it('fires onLaunch with the prediction net name when CTA clicked', () => {
    const onLaunch = vi.fn();
    render(<EmptyState onLaunch={onLaunch} />);
    fireEvent.click(screen.getByRole('button', { name: /Launch Prediction SolverNet/i }));
    expect(onLaunch).toHaveBeenCalledTimes(1);
    expect(onLaunch).toHaveBeenCalledWith('prediction');
  });
});
