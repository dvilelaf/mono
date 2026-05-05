import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NetCard } from './NetCard.js';

const apiMock = vi.hoisted(() => ({
  updateSolverNet: vi.fn(),
}));

vi.mock('../../api/client.js', () => ({
  api: {
    updateSolverNet: apiMock.updateSolverNet,
  },
}));

const baseCatalog = {
  name: 'prediction',
  description: 'Forecast resolved outcomes; rewarded by Brier score on verified resolutions.',
  intrinsicSolverType: 'prediction.v1',
  state: 'live' as const,
  supportedRoles: ['solving' as const, 'evaluating' as const],
  compatibleHarnesses: [{ name: 'claude-code-learner', version: '0.1.0', supportsRoles: ['solving' as const] }],
  compatiblePlugins: [{ name: 'jinn-prediction-plugin', version: '0.1.0', source: 'bundled' }],
};

describe('NetCard', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    apiMock.updateSolverNet.mockClear();
    apiMock.updateSolverNet.mockResolvedValue({
      ok: true,
      restartRequired: false,
      name: 'prediction',
      config: {},
    });
  });

  it('renders name, description, and Available state when disabled', () => {
    render(
      <NetCard
        catalog={baseCatalog}
        config={{ enabled: false, role: 'solving', harness: 'claude-code-learner', model: 'claude-haiku-4-5-20251001', plugins: [] }}
        onSaved={vi.fn()}
        onRestartPending={vi.fn()}
      />,
    );
    expect(screen.getByText('prediction')).toBeTruthy();
    expect(screen.getByText(/forecast resolved outcomes/i)).toBeTruthy();
    expect(screen.getByText(/available/i)).toBeTruthy();
  });

  it('expands the body when enabled and shows Solving role active', () => {
    render(
      <NetCard
        catalog={baseCatalog}
        config={{ enabled: true, role: 'solving', harness: 'claude-code-learner', model: 'claude-haiku-4-5-20251001', plugins: ['jinn-prediction-plugin'] }}
        onSaved={vi.fn()}
        onRestartPending={vi.fn()}
      />,
    );
    expect(screen.getByText(/live/i)).toBeTruthy();
    const solving = screen.getByText('Solving').closest('button');
    expect(solving?.getAttribute('data-role-active')).toBe('true');
  });

  it('does not persist the displayed fallback model when saving another field', async () => {
    render(
      <NetCard
        catalog={baseCatalog}
        config={{
          enabled: false,
          role: 'solving',
          harness: 'claude-code-learner',
          model: 'claude-haiku-4-5-20251001',
          modelExplicit: false,
          plugins: [],
        }}
        onSaved={vi.fn()}
        onRestartPending={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /enable prediction/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(apiMock.updateSolverNet).toHaveBeenCalled());
    expect(apiMock.updateSolverNet).toHaveBeenCalledWith('prediction', expect.not.objectContaining({
      model: expect.any(String),
    }));
  });

  it('renders the prediction orb sigil for catalog.name="prediction"', () => {
    render(
      <NetCard
        catalog={baseCatalog}
        config={{ enabled: false, role: 'solving', harness: 'claude-code-learner', model: 'claude-haiku-4-5-20251001', plugins: [] }}
        onSaved={vi.fn()}
        onRestartPending={vi.fn()}
      />,
    );
    const sigil = screen.getByTestId('solver-net-sigil');
    expect(sigil).toBeTruthy();
    expect(sigil.getAttribute('data-sigil-name')).toBe('prediction');
    expect(screen.getByTestId('solver-net-sigil-prediction')).toBeTruthy();
  });

  it('renders the fallback sigil for unknown SolverNet names', () => {
    render(
      <NetCard
        catalog={{ ...baseCatalog, name: 'mystery-net' }}
        config={{ enabled: false, role: 'solving', harness: 'claude-code-learner', model: 'claude-haiku-4-5-20251001', plugins: [] }}
        onSaved={vi.fn()}
        onRestartPending={vi.fn()}
      />,
    );
    const sigil = screen.getByTestId('solver-net-sigil');
    expect(sigil).toBeTruthy();
    expect(sigil.getAttribute('data-sigil-name')).toBe('mystery-net');
    expect(screen.getByTestId('solver-net-sigil-fallback')).toBeTruthy();
  });

  it('persists the model when the operator edits the fallback value', async () => {
    render(
      <NetCard
        catalog={baseCatalog}
        config={{
          enabled: true,
          role: 'solving',
          harness: 'claude-code-learner',
          model: 'claude-haiku-4-5-20251001',
          modelExplicit: false,
          plugins: [],
        }}
        onSaved={vi.fn()}
        onRestartPending={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Claude model'), {
      target: { value: 'claude-sonnet-4-6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(apiMock.updateSolverNet).toHaveBeenCalled());
    expect(apiMock.updateSolverNet).toHaveBeenCalledWith('prediction', expect.objectContaining({
      model: 'claude-sonnet-4-6',
    }));
  });

  it('renders an unknown model as a Custom option alongside the canonical tiers, and switching to Sonnet stages a dirty save', async () => {
    render(
      <NetCard
        catalog={baseCatalog}
        config={{
          enabled: true,
          role: 'solving',
          harness: 'claude-code-learner',
          model: 'claude-sonnet-4-5-20250929',
          modelExplicit: true,
          plugins: [],
        }}
        onSaved={vi.fn()}
        onRestartPending={vi.fn()}
      />,
    );

    const select = screen.getByLabelText('Claude model') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    const optionLabels = Array.from(select.options).map((o) => o.textContent);

    expect(optionValues).toContain('claude-haiku-4-5-20251001');
    expect(optionValues).toContain('claude-sonnet-4-6');
    expect(optionValues).toContain('claude-opus-4-7');
    expect(optionValues).toContain('claude-sonnet-4-5-20250929');
    expect(optionLabels).toContain('Haiku');
    expect(optionLabels).toContain('Sonnet');
    expect(optionLabels).toContain('Opus');
    expect(optionLabels).toContain('Custom (claude-sonnet-4-5-20250929)');

    // No dirty banner yet — select reflects the stored value.
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();

    fireEvent.change(select, { target: { value: 'claude-sonnet-4-6' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(apiMock.updateSolverNet).toHaveBeenCalled());
    expect(apiMock.updateSolverNet).toHaveBeenCalledWith('prediction', expect.objectContaining({
      model: 'claude-sonnet-4-6',
    }));
  });

  it('adds a plugin from the picker, becomes dirty, and persists on save', async () => {
    const multiPluginCatalog = {
      ...baseCatalog,
      compatiblePlugins: [
        { name: 'jinn-prediction-plugin', version: '0.1.0', source: 'bundled' },
        { name: 'network-tools', version: '0.2.0', source: 'bundled' },
      ],
    };
    render(
      <NetCard
        catalog={multiPluginCatalog}
        config={{
          enabled: true,
          role: 'solving',
          harness: 'claude-code-learner',
          model: 'claude-haiku-4-5-20251001',
          plugins: ['jinn-prediction-plugin'],
        }}
        onSaved={vi.fn()}
        onRestartPending={vi.fn()}
      />,
    );

    // No save button visible while clean.
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();

    fireEvent.change(screen.getByLabelText('Add plugin'), {
      target: { value: 'network-tools' },
    });

    // Dirty: save button appears.
    const saveBtn = await screen.findByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(apiMock.updateSolverNet).toHaveBeenCalled());
    expect(apiMock.updateSolverNet).toHaveBeenCalledWith('prediction', expect.objectContaining({
      plugins: ['jinn-prediction-plugin', 'network-tools'],
    }));
  });

  it('removes a plugin from the row, becomes dirty, and persists on save', async () => {
    render(
      <NetCard
        catalog={baseCatalog}
        config={{
          enabled: true,
          role: 'solving',
          harness: 'claude-code-learner',
          model: 'claude-haiku-4-5-20251001',
          plugins: ['jinn-prediction-plugin'],
        }}
        onSaved={vi.fn()}
        onRestartPending={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /remove jinn-prediction-plugin/i }));

    const saveBtn = await screen.findByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(apiMock.updateSolverNet).toHaveBeenCalled());
    expect(apiMock.updateSolverNet).toHaveBeenCalledWith('prediction', expect.objectContaining({
      plugins: [],
    }));
  });

  it('renders the empty-catalog hint when no plugins are compatible', () => {
    const emptyCatalog = { ...baseCatalog, compatiblePlugins: [] };
    render(
      <NetCard
        catalog={emptyCatalog}
        config={{
          enabled: true,
          role: 'solving',
          harness: 'claude-code-learner',
          model: 'claude-haiku-4-5-20251001',
          plugins: [],
        }}
        onSaved={vi.fn()}
        onRestartPending={vi.fn()}
      />,
    );
    expect(screen.getByText(/no plugins available for this solvernet/i)).toBeTruthy();
    expect(screen.queryByLabelText('Add plugin')).toBeNull();
  });
});
