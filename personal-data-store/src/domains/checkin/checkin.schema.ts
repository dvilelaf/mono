import { pgTable, uuid, text, boolean, integer, timestamp, date, unique, index } from "drizzle-orm/pg-core";

export const supplementStack = pgTable(
  "supplement_stack",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    dosage: text("dosage"),
    unit: text("unit"),
    schedule: text("schedule"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("supplement_stack_name_uniq").on(table.name),
    index("supplement_stack_active_idx").on(table.active),
  ],
);

export const adherenceMisses = pgTable(
  "adherence_misses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missDate: date("miss_date").notNull(),
    category: text("category").notNull().default("checkin"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("adherence_misses_date_category_uniq").on(table.missDate, table.category),
    index("adherence_misses_date_idx").on(table.missDate),
  ],
);
