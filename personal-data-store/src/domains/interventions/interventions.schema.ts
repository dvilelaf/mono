import { pgTable, uuid, text, numeric, timestamp, integer, index, unique } from "drizzle-orm/pg-core";

export const interventions = pgTable(
  "interventions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    domain: text("domain").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull().default("active"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    hypothesis: text("hypothesis"),
    affectedMetrics: text("affected_metrics").array(),
    affectedGoals: text("affected_goals").array(),
    metricSource: text("metric_source"),
    protocol: text("protocol"),
    windowDays: integer("window_days").notNull().default(28),
    canonicalTopics: text("canonical_topics").array(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("interventions_slug_uniq").on(table.slug),
    index("interventions_domain_idx").on(table.domain),
    index("interventions_status_idx").on(table.status),
  ]
);

export const interventionObservations = pgTable(
  "intervention_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    interventionId: uuid("intervention_id").notNull().references(() => interventions.id, { onDelete: "cascade" }),
    metricName: text("metric_name").notNull(),
    metricSource: text("metric_source"),
    valueBefore: numeric("value_before"),
    valueAfter: numeric("value_after"),
    delta: numeric("delta"),
    deltaPct: numeric("delta_pct"),
    nBefore: integer("n_before"),
    nAfter: integer("n_after"),
    windowDays: integer("window_days").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("intervention_observations_intervention_observed_idx").on(table.interventionId, table.observedAt),
    index("intervention_observations_metric_idx").on(table.metricName),
  ]
);
