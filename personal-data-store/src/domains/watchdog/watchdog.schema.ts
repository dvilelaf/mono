import { pgTable, uuid, text, timestamp, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const watchdogAlerts = pgTable(
  "watchdog_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkType: text("check_type").notNull(),
    severity: text("severity").notNull().default("warning"),
    subject: text("subject").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    fingerprint: text("fingerprint").notNull(),
    metadata: jsonb("metadata"),
    resolved: boolean("resolved").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("watchdog_alerts_resolved_created_idx").on(table.resolved, table.createdAt),
    index("watchdog_alerts_check_type_idx").on(table.checkType),
    uniqueIndex("watchdog_alerts_open_fingerprint_uniq")
      .on(table.fingerprint)
      .where(sql`${table.resolved} = false`),
  ],
);
