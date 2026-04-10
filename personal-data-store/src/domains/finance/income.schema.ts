import { pgTable, uuid, text, numeric, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";

export const incomeStreams = pgTable(
  "income_streams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    streamType: text("stream_type").notNull(),
    asset: text("asset"),
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("income_streams_source_idx").on(table.source, table.streamType),
    index("income_streams_period_idx").on(table.periodStart),
    unique("income_streams_source_period_uniq").on(table.source, table.streamType, table.asset, table.periodStart),
  ]
);
