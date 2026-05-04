import { pgTable, uuid, text, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull().default("synthesis"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  metadata: jsonb("metadata").default({}),
  delivered: boolean("delivered").default(false),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
