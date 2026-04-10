import { pgTable, uuid, text, numeric, timestamp, jsonb, index, unique, boolean } from "drizzle-orm/pg-core";

export const healthMetrics = pgTable(
  "health_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    metricType: text("metric_type").notNull(),
    value: numeric("value").notNull(),
    unit: text("unit").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("health_metrics_type_recorded_idx").on(table.metricType, table.recordedAt),
    index("health_metrics_source_recorded_idx").on(table.source, table.recordedAt),
    unique("health_metrics_source_type_recorded_uniq").on(table.source, table.metricType, table.recordedAt),
  ]
);

export const supplements = pgTable("supplements", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  dosage: text("dosage"),
  unit: text("unit"),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id"),
    name: text("name").notNull(),
    source: text("source").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    duration: numeric("duration"),
    distance: numeric("distance"),
    distanceUnit: text("distance_unit"),
    activeEnergy: numeric("active_energy"),
    activeEnergyUnit: text("active_energy_unit"),
    avgHeartRate: numeric("avg_heart_rate"),
    maxHeartRate: numeric("max_heart_rate"),
    location: text("location"),
    isIndoor: boolean("is_indoor"),
    metadata: jsonb("metadata"),
    route: jsonb("route"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("workouts_name_started_idx").on(table.name, table.startedAt),
    unique("workouts_external_id_uniq").on(table.externalId),
  ]
);

export const nutritionEntries = pgTable("nutrition_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealType: text("meal_type"),
  foods: jsonb("foods"),
  calories: numeric("calories"),
  protein: numeric("protein"),
  carbs: numeric("carbs"),
  fat: numeric("fat"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
