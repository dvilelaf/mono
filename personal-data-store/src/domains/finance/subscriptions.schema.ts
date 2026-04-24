import { pgTable, uuid, text, numeric, date, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull(),
    frequency: text("frequency").notNull(),
    status: text("status").notNull().default("active"),
    confidence: text("confidence").notNull(),
    firstSeen: date("first_seen").notNull(),
    lastSeen: date("last_seen").notNull(),
    nextExpected: date("next_expected"),
    category: text("category"),
    metadata: jsonb("metadata"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("subscriptions_desc_currency_uniq").on(table.description, table.currency),
    index("subscriptions_status_idx").on(table.status),
  ]
);
