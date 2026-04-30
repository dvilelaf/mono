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
 * `request_id`. A cycle is complete when both a `restoration-result` SUCCESS
 * and an `evaluation-verdict` SUCCESS row exist for the same request_id.
 *
 * Used by the docker acceptance gate to track auto-generated `prediction.v0`
 * cycles whose desired_state_ids (`pred-v0-auto-<bucket>`) are not known
 * up-front.
 */
export function summarizeRunWindowArtifacts(rows, runStartAt) {
  const byRequestId = new Map();
  const startMs = Date.parse(runStartAt);
  for (const row of rows) {
    if (!row.request_id) continue;
    if (Number.isFinite(startMs) && row.created_at) {
      const created = Date.parse(row.created_at);
      if (Number.isFinite(created) && created < startMs) continue;
    }
    let entry = byRequestId.get(row.request_id);
    if (!entry) {
      entry = {
        requestId: row.request_id,
        desiredStateId: row.desired_state_id,
        restorationOk: false,
        evaluationOk: false,
        latestArtifactAt: null,
      };
      byRequestId.set(row.request_id, entry);
    }
    const tags = new Set(normalizeTags(row.tags));
    if (tags.has('restoration-result') && row.outcome === 'SUCCESS') entry.restorationOk = true;
    if (tags.has('evaluation-verdict') && row.outcome === 'SUCCESS') entry.evaluationOk = true;
    entry.latestArtifactAt = row.created_at ?? entry.latestArtifactAt;
  }
  const entries = Array.from(byRequestId.values());
  return {
    rows,
    byRequestId: entries,
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
