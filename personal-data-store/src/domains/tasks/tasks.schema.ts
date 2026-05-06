import { pgTable, uuid, text, timestamp, integer, jsonb, index, unique } from "drizzle-orm/pg-core";

// Action queue seeded from wiki/20-synthesis/blockers (issue #10).
// `evidence_query` is a forward-compatible slot for completion-evidence rules
// (e.g. "task done when health_metrics has a row newer than X"). v1 = manual.
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    source: text("source").notNull().default("manual"),
    sourcePath: text("source_path"),
    goalSlug: text("goal_slug"),
    goalId: uuid("goal_id"),
    status: text("status").notNull().default("open"),
    priority: integer("priority").notNull().default(3),
    dueDate: timestamp("due_date", { withTimezone: true }),
    smallestNextAction: text("smallest_next_action"),
    evidenceQuery: jsonb("evidence_query"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("tasks_slug_uniq").on(table.slug),
    index("tasks_status_idx").on(table.status),
    index("tasks_goal_slug_idx").on(table.goalSlug),
    index("tasks_priority_idx").on(table.priority),
  ],
);
