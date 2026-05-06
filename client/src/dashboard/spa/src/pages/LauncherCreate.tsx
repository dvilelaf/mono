/**
 * Placeholder for the 5-step Create flow at `/launcher/create`.
 *
 * Spec: `spec/2026-05-05-solvernet-creation-and-launch.md`.
 *
 * Task 16 wires the route only. Task 18 replaces this stub with the real
 * wizard (Define / Review contract / Configure generator / Configure pricing
 * / Review & launch) backed by `api.solvernets.{createDraft, updateDraft,
 * launch}`.
 */
export function LauncherCreatePage(): JSX.Element {
  return (
    <main data-testid="launcher-create-placeholder" className="p-8">
      <h1 className="text-2xl">Create SolverNet</h1>
      <p className="mt-2 text-muted">
        Task 18 will replace this placeholder with the 5-step wizard.
      </p>
    </main>
  );
}
