type GeneratedSourceSolverNet = {
  enabled?: boolean;
  solverType?: string;
  roles?: string[];
  taskGenerator?: { enabled?: boolean };
};

/**
 * Decide whether a generated TaskSource should be installed for a SolverType.
 *
 * Legacy solver/evaluator participation still requires `enabled: true` plus a
 * restoration-capable role. Launcher mode is different: SetupFlow owns the
 * `launching` role and deliberately does not flip the legacy enabled flag, so
 * a launching net with task generation enabled must still register its source.
 */
export function generatedTaskSourceSupported(
  solverNets: Record<string, GeneratedSourceSolverNet> | undefined,
  solverType: string,
): boolean {
  return Object.values(solverNets ?? {}).some((net) => {
    if (net.solverType !== solverType || net.taskGenerator?.enabled !== true) {
      return false;
    }
    const roles = Array.isArray(net.roles) ? net.roles : [];
    if (roles.includes('launching')) return true;
    return net.enabled === true && (roles.length === 0 || roles.includes('solving'));
  });
}
