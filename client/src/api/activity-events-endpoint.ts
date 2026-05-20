/**
 * /v1/activity-events — paginated, filtered access to the persistent
 * `activity_events` lifecycle stream (issue #419, the dedicated Events page).
 *
 * Distinct from /v1/events (the in-memory StructuredEvent ring buffer). This
 * endpoint reads the SQLite `activity_events` table populated by `emitEvent()`
 * and supports kind/outcome filtering plus id-cursored pagination.
 *
 *   GET /v1/activity-events?kinds=task_posted,reward_claimed&outcome=failed&beforeId=<id>&limit=50
 *     -> { events, nextCursor, counts }
 *   GET /v1/activity-events/:id
 *     -> the single event, or 404
 */
import type { Hono } from 'hono';
import type { Store } from '../store/store.js';
import { ALLOWED_LIFECYCLE_KINDS } from '../observability/emit-event.js';

const ALLOWED_OUTCOMES = ['ok', 'failed', 'warn'] as const;

export interface ActivityEventRoutesDeps {
  store: Store;
}

/** Parse a comma-separated kinds query param, keeping only valid lifecycle kinds. */
function parseKinds(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((k) => k.trim()).filter(Boolean);
  const out = parts.filter((p) => (ALLOWED_LIFECYCLE_KINDS as readonly string[]).includes(p));
  return out.length > 0 ? out : undefined;
}

function parseOutcome(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return (ALLOWED_OUTCOMES as readonly string[]).includes(raw) ? raw : undefined;
}

export function addActivityEventsRoutes(app: Hono, deps: ActivityEventRoutesDeps): void {
  app.get('/v1/activity-events', (c) => {
    const kinds = parseKinds(c.req.query('kinds'));
    const outcome = parseOutcome(c.req.query('outcome'));
    const beforeIdRaw = c.req.query('beforeId');
    const beforeId = beforeIdRaw !== undefined && /^\d+$/.test(beforeIdRaw)
      ? parseInt(beforeIdRaw, 10)
      : undefined;
    const limitRaw = c.req.query('limit');
    const limit = limitRaw
      ? Math.max(1, Math.min(200, parseInt(limitRaw, 10) || 50))
      : 50;

    const events = deps.store.getActivityEventsPage({ kinds, outcome, beforeId, limit });
    // A full page implies there may be more; cursor on the last (oldest) id.
    const nextCursor = events.length === limit && events.length > 0
      ? events[events.length - 1].id
      : null;
    const counts = deps.store.getActivityCountsByKind();

    return c.json({ events, nextCursor, counts });
  });

  app.get('/v1/activity-events/:id', (c) => {
    const idRaw = c.req.param('id');
    if (!/^\d+$/.test(idRaw)) {
      return c.json({ error: 'invalid_event_id' }, 400);
    }
    const event = deps.store.getActivityEventById(parseInt(idRaw, 10));
    if (!event) {
      return c.json({ error: 'event_not_found' }, 404);
    }
    return c.json(event);
  });
}
