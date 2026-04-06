import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const connectorRuns = pgTable("connector_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  connector: text("connector").notNull(),
  status: text("status").notNull(), // running, success, failed
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  recordsSynced: integer("records_synced"),
  error: text("error"),
  metadata: jsonb("metadata"),
});
