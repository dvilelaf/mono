import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Router, Route, Switch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverviewPage } from './pages/Overview.js';
import { ConfigurationPage } from './pages/Configuration.js';
import { LauncherPage } from './pages/Launcher.js';
import { LauncherConfigurationPage } from './pages/LauncherConfiguration.js';
import { LauncherCreatePage } from './pages/LauncherCreate.js';
import { LauncherLaunchedPage } from './pages/LauncherLaunched.js';

// Configuration + Overview + Launcher pages all useQuery for the daemon API;
// mock so the routing tests don't depend on a live server.
vi.mock('./api/client.js', () => ({
  api: {
    getBootstrap: async () => ({}),
    getStatus: async () => ({}),
    getSolverNets: async () => ({ schemaVersion: 1, generatedAt: '', nets: [] }),
    claimRewards: async () => ({ ok: true }),
    restartDaemon: async () => ({ ok: true }),
    fetchLauncherStatus: async () => ({ schemaVersion: 1, generatedAt: '', nets: [] }),
    fetchLauncherTasks: async () => ({ schemaVersion: 1, generatedAt: '', tasks: [] }),
    patchLauncherSolverNet: async () => ({ ok: true, name: 'prediction', roles: [], generator: {} }),
    solvernets: {
      listDrafts: async () => ({ drafts: [] }),
      getDraft: async () => ({}),
      createDraft: async () => ({}),
      updateDraft: async () => ({}),
      deleteDraft: async () => ({ ok: true }),
      launch: async () => ({ solverNetId: '', status: 'launching', pollUrl: '' }),
      transitionLifecycle: async () => ({}),
      updateGeneratorConfig: async () => ({}),
      get: async () => ({}),
      listLaunched: async () => ({ records: [] }),
      listRegistry: async () => ({ summaries: [], lastRefreshedAt: null, lastError: null }),
      getManifest: async () => ({}),
    },
  },
}));

function withProviders(node: JSX.Element, path: string): JSX.Element {
  const { hook } = memoryLocation({ path });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <Router hook={hook}>{node}</Router>
    </QueryClientProvider>
  );
}

describe('App routes', () => {
  it('renders OverviewPage on /overview', () => {
    render(
      withProviders(
        <Switch>
          <Route path="/overview"><OverviewPage /></Route>
          <Route path="/configuration"><ConfigurationPage /></Route>
        </Switch>,
        '/overview',
      ),
    );
    // Overview renders HeroStats with these canonical eyebrows.
    expect(screen.getByText(/tasks delivered/i)).toBeTruthy();
    expect(screen.getByText(/jinn earned/i)).toBeTruthy();
  });

  it('renders ConfigurationPage on /configuration', () => {
    render(
      withProviders(
        <Switch>
          <Route path="/overview"><OverviewPage /></Route>
          <Route path="/configuration"><ConfigurationPage /></Route>
        </Switch>,
        '/configuration',
      ),
    );
    // Configuration is composed of three section cards; the SolverNets head
    // is the most stable assertion since it never collapses to nothing.
    expect(screen.getByText(/solvernets/i)).toBeTruthy();
  });

  it('renders LauncherPage on /launcher', async () => {
    render(
      withProviders(
        <Switch>
          <Route path="/launcher" component={LauncherPage} />
          <Route path="/launcher/configuration" component={LauncherConfigurationPage} />
        </Switch>,
        '/launcher',
      ),
    );
    // No SolverNet has 'launching' role yet -> empty state surfaces.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /you haven't launched a solvernet yet/i })).toBeTruthy(),
    );
  });

  it('renders LauncherConfigurationPage on /launcher/configuration', () => {
    render(
      withProviders(
        <Switch>
          <Route path="/launcher" component={LauncherPage} />
          <Route path="/launcher/configuration" component={LauncherConfigurationPage} />
        </Switch>,
        '/launcher/configuration',
      ),
    );
    expect(screen.getByRole('heading', { name: /generator config/i })).toBeTruthy();
  });

  // ── New SolverNet creation/launch routes (Task 16 scaffolding) ──
  // These routes render placeholder components until Tasks 18 + 19 fill them
  // in. We assert the routes match and the placeholders render so the SPA
  // doesn't crash when an operator navigates to them.

  it('renders LauncherCreatePage placeholder on /launcher/create', () => {
    render(
      withProviders(
        <Switch>
          <Route path="/launcher/create" component={LauncherCreatePage} />
          <Route path="/launcher/launched/:solverNetId" component={LauncherLaunchedPage} />
          <Route path="/launcher" component={LauncherPage} />
        </Switch>,
        '/launcher/create',
      ),
    );
    expect(screen.getByTestId('launcher-create-placeholder')).toBeTruthy();
  });

  it('renders LauncherLaunchedPage placeholder on /launcher/launched/:solverNetId and exposes the param', () => {
    render(
      withProviders(
        <Switch>
          <Route path="/launcher/create" component={LauncherCreatePage} />
          <Route path="/launcher/launched/:solverNetId" component={LauncherLaunchedPage} />
          <Route path="/launcher" component={LauncherPage} />
        </Switch>,
        '/launcher/launched/agent-1_prediction.v1-1_abcdef01',
      ),
    );
    expect(screen.getByTestId('launcher-launched-placeholder')).toBeTruthy();
    const idEl = screen.getByTestId('launcher-launched-solvernet-id');
    expect(idEl.textContent).toContain('agent-1_prediction.v1-1_abcdef01');
  });
});
