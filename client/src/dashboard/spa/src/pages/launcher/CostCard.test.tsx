import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CostCard } from './CostCard.js';

describe('CostCard', () => {
  it('renders 7-day burn rate, Tasks funded, open-task budget reservations', () => {
    render(
      <CostCard
        burn7dWei="500000000000000000"
        tasksFunded7d={42}
        openTaskBudgetWei="200000000000000000"
      />,
    );
    expect(screen.queryByText(/0\.5/)).toBeTruthy(); // 0.5 ETH burn
    expect(screen.queryByText(/42/)).toBeTruthy(); // 42 Tasks
    expect(screen.queryByText(/0\.2/)).toBeTruthy(); // 0.2 ETH reserved
  });

  it('renders zero burn cleanly', () => {
    render(<CostCard burn7dWei="0" tasksFunded7d={0} openTaskBudgetWei="0" />);
    // Both "Burn (7d)" and "Open-budget reserved" render 0.0000 ETH; the
    // count is two and there's no NaN.
    const matches = screen.queryAllByText(/0\.0000/);
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
