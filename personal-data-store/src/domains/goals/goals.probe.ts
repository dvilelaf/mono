import {
  listGoals,
  getGoalBySlug,
  updateGoal,
  recordObservation,
  probeMetricSource,
  deriveStatus,
  deriveTrajectory,
  computeEta,
  type MetricSource,
} from "./goals.service.js";

export interface ProbeResult {
  slug: string;
  previousValue: number | null;
  observedValue: number | null;
  status: string;
  previousStatus: string;
  trajectory: string;
  eta: string | null;
  changed: boolean;
}

export async function runProbeForSlug(slug: string): Promise<ProbeResult | null> {
  const goal = await getGoalBySlug(slug);
  if (!goal) return null;
  return runProbe(goal);
}

export async function runProbe(goal: Awaited<ReturnType<typeof listGoals>>[number]): Promise<ProbeResult> {
  const previousValue = goal.currentValue === null ? null : Number(goal.currentValue);
  const previousStatus = goal.status;
  const observedValue = await probeMetricSource(goal.metricSource as unknown as MetricSource);
  const trajectory = deriveTrajectory(previousValue, observedValue, goal.targetDirection);
  const status = deriveStatus(goal, observedValue);

  if (observedValue !== null) {
    await recordObservation({
      goalId: goal.id,
      observedValue,
      observedAt: new Date(),
      trajectory,
      deltaFromPrevious: previousValue === null ? null : observedValue - previousValue,
    });
  }

  const eta = await computeEta(goal.id, goal.targetValue === null ? null : Number(goal.targetValue), goal.targetDirection);

  await updateGoal(goal.slug, {
    currentValue: observedValue ?? null,
    previousValue: previousValue,
    status,
    eta: eta ? eta.toISOString() : null,
  });

  return {
    slug: goal.slug,
    previousValue,
    observedValue,
    status,
    previousStatus,
    trajectory,
    eta: eta ? eta.toISOString() : null,
    changed: status !== previousStatus,
  };
}

export async function runAllProbes(): Promise<ProbeResult[]> {
  const all = await listGoals();
  const results: ProbeResult[] = [];
  for (const goal of all) {
    try {
      results.push(await runProbe(goal));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[goals.probe] ${goal.slug} failed: ${message}`);
    }
  }
  return results;
}
