import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { KnowledgeProductionCard, type RecentSettledForecast } from './KnowledgeProductionCard.js';

const baseFixture = {
  netName: 'prediction',
  intent: 'Calibrated probabilistic forecasts of Polymarket-listed events',
  scoreboard: { brierSpread: -0.012, windowDays: 28 },
  recentSettled: Array.from({ length: 5 }, (_, i): RecentSettledForecast => ({
    taskId: `0x${i}`,
    predicate: `Will Event ${i} happen?`,
    outcome: i % 2 === 0 ? 'YES' : 'NO',
    settledAt: '2026-05-05T10:00:00Z',
    forecastProb: 0.6,
  })),
};

describe('KnowledgeProductionCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders intent + Brier headline + 5 recent forecasts', () => {
    render(<KnowledgeProductionCard {...baseFixture} />);
    expect(screen.queryByText(/Calibrated probabilistic forecasts/i)).toBeTruthy();
    expect(screen.queryByText(/Brier spread/i)).toBeTruthy();
    expect(screen.queryAllByTestId('recent-settled-row')).toHaveLength(5);
  });

  it('handles empty recentSettled with a "no forecasts yet" hint', () => {
    render(<KnowledgeProductionCard {...baseFixture} recentSettled={[]} />);
    expect(screen.queryByText(/no forecasts settled yet/i)).toBeTruthy();
    expect(screen.queryAllByTestId('recent-settled-row')).toHaveLength(0);
  });

  it('falls back to a pending headline when no scoreboard is provided', () => {
    render(<KnowledgeProductionCard {...baseFixture} scoreboard={undefined} />);
    expect(screen.queryByText(/Brier spread: pending/i)).toBeTruthy();
  });

  it('signs positive Brier spreads with a leading "+" and 4-decimal precision', () => {
    render(
      <KnowledgeProductionCard
        {...baseFixture}
        scoreboard={{ brierSpread: 0.0034, windowDays: 28 }}
      />,
    );
    expect(screen.queryByText(/\+0\.0034/)).toBeTruthy();
  });
});
