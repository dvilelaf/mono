import { PortfolioV0IntentSchema } from '../../types/portfolio.js';
import type { SolverTypeDefinition } from './solver-type.js';

export const portfolioV0: SolverTypeDefinition = {
  solverType: 'portfolio.v0',
  async parseSpec(raw) {
    const intent = PortfolioV0IntentSchema.parse(raw);
    return { window: intent.window, spec: intent.spec, eligibility: intent.eligibility };
  },
  ui: {
    description: 'Portfolio trading intent (Hyperliquid)',
    category: 'portfolio',
  },
};
