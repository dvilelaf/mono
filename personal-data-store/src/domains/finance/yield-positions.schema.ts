import { pgTable, uuid, text, numeric, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const yieldPositions = pgTable(
  "yield_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    protocol: text("protocol").notNull(),
    chain: text("chain").notNull(),
    token: text("token").notNull(),
    tokenBalance: numeric("token_balance").notNull(),
    tokenPrice: numeric("token_price").notNull(),
    valueUsd: numeric("value_usd").notNull(),
    apy: numeric("apy"),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("yield_positions_name_snapshot_idx").on(table.name, table.snapshotAt),
  ]
);
