import { pgTable, uuid, text, numeric, timestamp, jsonb, index, unique, integer } from "drizzle-orm/pg-core";

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    domain: text("domain").notNull(),
    metricSource: jsonb("metric_source").notNull(),
    targetValue: numeric("target_value"),
    targetRangeLow: numeric("target_range_low"),
    targetRangeHigh: numeric("target_range_high"),
    targetDirection: text("target_direction").notNull(),
    targetDate: timestamp("target_date", { withTimezone: true }),
    currentValue: numeric("current_value"),
    previousValue: numeric("previous_value"),
    currentValueAt: timestamp("current_value_at", { withTimezone: true }),
    status: text("status").notNull().default("unknown"),
    eta: timestamp("eta", { withTimezone: true }),
    priority: integer("priority").notNull().default(3),
    canonicalTopics: text("canonical_topics").array(),
    unit: text("unit"),
    notes: text("notes"),
    narrativeDocId: uuid("narrative_doc_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("goals_slug_uniq").on(table.slug),
    index("goals_domain_idx").on(table.domain),
    index("goals_status_idx").on(table.status),
  ]
);

export const goalObservations = pgTable(
  "goal_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    observedValue: numeric("observed_value").notNull(),
    deltaFromPrevious: numeric("delta_from_previous"),
    trajectory: text("trajectory"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("goal_observations_goal_observed_idx").on(table.goalId, table.observedAt),
  ]
);
