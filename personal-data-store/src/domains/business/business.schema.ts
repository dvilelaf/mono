import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  contactInfo: jsonb("contact_info"),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    name: text("name").notNull(),
    status: text("status").notNull(),
    rate: jsonb("rate"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("projects_client_idx").on(table.clientId),
  ]
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    description: text("description"),
    hours: numeric("hours").notNull(),
    workedAt: date("worked_at").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("time_entries_project_date_idx").on(table.projectId, table.workedAt),
  ]
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    projectId: uuid("project_id").references(() => projects.id),
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    issuedAt: date("issued_at"),
    paidAt: date("paid_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("invoices_client_idx").on(table.clientId),
    index("invoices_status_idx").on(table.status),
  ]
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: text("category"),
    description: text("description"),
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull(),
    incurredAt: date("incurred_at").notNull(),
    taxDeductible: boolean("tax_deductible"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("expenses_category_date_idx").on(table.category, table.incurredAt),
  ]
);
