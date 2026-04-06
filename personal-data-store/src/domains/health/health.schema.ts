import { pgTable, uuid, text, numeric, timestamp, jsonb, index } from "drizzle-orm/pg-core";

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
