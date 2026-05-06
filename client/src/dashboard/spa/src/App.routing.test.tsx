import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Router, Route, Switch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverviewPage } from './pages/Overview.js';
import { ConfigurationPage } from './pages/Configuration.js';
import { LauncherPage } from './pages/Launcher.js';
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
    solvernets: {
      listDrafts: async () => ({ drafts: [] }),
      getDraft: async () => ({}),
      createDraft: async () => ({
        schemaVersion: 'solvernet.draft.v1',
        draftId: 'd-routing-test',
        completedSteps: [],
        createdAt: '2026-05-05T00:00:00Z',
        updatedAt: '2026-05-05T00:00:00Z',
      }),
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
          <Route path="/launcher/create" component={LauncherCreatePage} />
          <Route path="/launcher/launched/:solverNetId" component={LauncherLaunchedPage} />
          <Route path="/launcher" component={LauncherPage} />
        </Switch>,
        '/launcher',
      ),
    );
    // No owned launched records yet -> empty state surfaces (spec §10).
    await waitFor(() =>
      expect(screen.getByText(/no solvernets created yet\./i)).toBeTruthy(),
    );
  });

  // ── New SolverNet creation/launch routes ──
  // /launcher/create renders the 5-step wizard (Task 18); /launcher/launched/:id
  // renders the Task 19 placeholder for now. The routing test asserts the route
  // matches and the wizard shell renders without crashing.

  it('renders LauncherCreatePage wizard on /launcher/create', async () => {
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
    // The wizard shows a loading state while the draft is created on mount,
    // then advances to Step 1.
    expect(screen.getByTestId('launcher-create-loading')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('launcher-create-step-1')).toBeTruthy(),
    );
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
