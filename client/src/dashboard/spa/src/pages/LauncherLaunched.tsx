/**
 * Placeholder for the post-launch dashboard at
 * `/launcher/launched/:solverNetId`.
 *
 * Spec: `spec/2026-05-05-solvernet-creation-and-launch.md`.
 *
 * Task 16 wires the route + extracts the `:solverNetId` param. Task 19
 * replaces the body with the real dashboard (lifecycle controls, generator
 * config editor, posted-tasks list, cost card) backed by
 * `api.solvernets.{get, transitionLifecycle, updateGeneratorConfig}`.
 */
import { useParams } from 'wouter';

export function LauncherLaunchedPage(): JSX.Element {
  const params = useParams<{ solverNetId: string }>();
  const solverNetId = params.solverNetId;
  return (
    <main data-testid="launcher-launched-placeholder" className="p-8">
      <h1 className="text-2xl">Launched SolverNet</h1>
      <p className="mt-2 text-muted">
        Task 19 will replace this placeholder with the post-launch dashboard.
      </p>
      <p
        className="mt-4 font-mono text-sm"
        data-testid="launcher-launched-solvernet-id"
      >
        solverNetId: {solverNetId ?? '<missing>'}
      </p>
    </main>
  );
}
