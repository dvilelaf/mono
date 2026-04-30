import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

export function normalizeTags(rawTags) {
  if (Array.isArray(rawTags)) {
    return rawTags.map((tag) => String(tag));
  }
  if (typeof rawTags !== 'string' || rawTags.trim() === '') {
    return [];
  }
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed) ? parsed.map((tag) => String(tag)) : [];
  } catch {
    return [];
  }
}

export function summarizeArtifactRows(rows, desiredStateIds) {
  const byRestorationJob = Object.fromEntries(
    desiredStateIds.map((id) => [id, {
      restorationArtifacts: 0,
      successfulRestorations: 0,
      evaluationArtifacts: 0,
      successfulEvaluations: 0,
      latestArtifactAt: null,
      requestIds: [],
    }]),
  );

  for (const row of rows) {
    const state = byRestorationJob[row.desired_state_id];
    if (!state) continue;
    const tagSet = new Set(normalizeTags(row.tags));
    if (tagSet.has('restoration-result')) {
      state.restorationArtifacts += 1;
      if (row.outcome === 'SUCCESS') {
        state.successfulRestorations += 1;
      }
    }
    if (tagSet.has('evaluation-verdict')) {
      state.evaluationArtifacts += 1;
      if (row.outcome === 'SUCCESS') {
        state.successfulEvaluations += 1;
      }
    }
    if (row.request_id && !state.requestIds.includes(row.request_id)) {
      state.requestIds.push(row.request_id);
    }
    state.latestArtifactAt = row.created_at ?? null;
  }

  const completedCycles = desiredStateIds.reduce((sum, desiredStateId) => {
    const state = byRestorationJob[desiredStateId];
    return sum + (
      state.successfulRestorations > 0 && state.successfulEvaluations > 0
        ? 1
        : 0
    );
  }, 0);

  return {
    rows,
    byRestorationJob,
    completedCycles,
  };
}

export function readArtifactProgress(dbPath, desiredStateIds) {
  if (!existsSync(dbPath)) {
    return summarizeArtifactRows([], desiredStateIds);
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const placeholders = desiredStateIds.map(() => '?').join(', ');
    const rows = db.prepare(
      `SELECT desired_state_id, request_id, title, tags, outcome, created_at
         FROM artifacts
        WHERE desired_state_id IN (${placeholders})
        ORDER BY created_at ASC`,
    ).all(...desiredStateIds);

    return summarizeArtifactRows(rows, desiredStateIds);
  } finally {
    db.close();
  }
}

/**
 * Aggregate artifacts produced after `runStartAt` (ISO 8601), grouped by
 * `desired_state_id`. A cycle is complete when both a `restoration-result`
 * SUCCESS and an `evaluation-verdict` SUCCESS row exist for the same
 * `desired_state_id`.
 *
 * The on-chain restoration and evaluation phases each get their own
 * `request_id` (separate mech submissions), but they share the
 * `pred-v0-auto-<bucket>` `desired_state_id` from the auto-generator
 * template. Grouping by `desired_state_id` therefore matches the cycle, not
 * the phase.
 */
export function summarizeRunWindowArtifacts(rows, runStartAt) {
  const byDesiredStateId = new Map();
  const startMs = Date.parse(runStartAt);
  for (const row of rows) {
    if (!row.desired_state_id) continue;
    if (Number.isFinite(startMs) && row.created_at) {
      const created = Date.parse(row.created_at);
      if (Number.isFinite(created) && created < startMs) continue;
    }
    let entry = byDesiredStateId.get(row.desired_state_id);
    if (!entry) {
      entry = {
        desiredStateId: row.desired_state_id,
        restorationRequestId: null,
        evaluationRequestId: null,
        restorationOk: false,
        evaluationOk: false,
        latestArtifactAt: null,
      };
      byDesiredStateId.set(row.desired_state_id, entry);
    }
    const tags = new Set(normalizeTags(row.tags));
    if (tags.has('restoration-result')) {
      if (row.outcome === 'SUCCESS') entry.restorationOk = true;
      if (row.request_id) entry.restorationRequestId = row.request_id;
    }
    if (tags.has('evaluation-verdict')) {
      if (row.outcome === 'SUCCESS') entry.evaluationOk = true;
      if (row.request_id) entry.evaluationRequestId = row.request_id;
    }
    entry.latestArtifactAt = row.created_at ?? entry.latestArtifactAt;
  }
  const entries = Array.from(byDesiredStateId.values());
  return {
    rows,
    byDesiredStateId: entries,
    completedCycles: entries.filter((e) => e.restorationOk && e.evaluationOk).length,
  };
}

/**
 * Read artifacts produced after `runStartAt` whose desired_state_id matches
 * the auto-generated `prediction.v0` prefix, then summarise as run-window
 * cycles. Returns the same shape regardless of whether the DB exists.
 */
export function readRunWindowArtifactProgress(dbPath, runStartAt) {
  if (!existsSync(dbPath)) {
    return summarizeRunWindowArtifacts([], runStartAt);
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare(
      `SELECT desired_state_id, request_id, title, tags, outcome, created_at
         FROM artifacts
        WHERE desired_state_id LIKE 'pred-v0-auto-%'
          AND created_at >= ?
        ORDER BY created_at ASC`,
    ).all(runStartAt);
    return summarizeRunWindowArtifacts(rows, runStartAt);
  } finally {
    db.close();
  }
}
