import { db } from "../../db/index.js";
import { clients, projects, timeEntries, invoices, expenses } from "./business.schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";

// --- Clients ---

interface CreateClientInput {
  name: string;
  contactInfo?: Record<string, unknown>;
  status: string;
}

export async function createClient(input: CreateClientInput) {
  const [row] = await db
    .insert(clients)
    .values({
      name: input.name,
      contactInfo: input.contactInfo,
      status: input.status,
    })
    .returning();
  return row;
}

export async function queryClients(filters: { status?: string }) {
  const conditions = [];
  if (filters.status) conditions.push(eq(clients.status, filters.status));

  return db
    .select()
    .from(clients)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(clients.createdAt));
}

// --- Projects ---

interface CreateProjectInput {
  clientId: string;
  name: string;
  status: string;
  rate?: Record<string, unknown>;
  startedAt?: string;
  endedAt?: string;
}

export async function createProject(input: CreateProjectInput) {
  const [row] = await db
    .insert(projects)
    .values({
      clientId: input.clientId,
      name: input.name,
      status: input.status,
      rate: input.rate,
      startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
      endedAt: input.endedAt ? new Date(input.endedAt) : undefined,
    })
    .returning();
  return row;
}

export async function queryProjects(filters: { clientId?: string; status?: string }) {
  const conditions = [];
  if (filters.clientId) conditions.push(eq(projects.clientId, filters.clientId));
  if (filters.status) conditions.push(eq(projects.status, filters.status));

  return db
    .select()
    .from(projects)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(projects.createdAt));
}

// --- Time Entries ---

interface CreateTimeEntryInput {
  projectId: string;
  description?: string;
  hours: number;
  workedAt: string;
}

export async function createTimeEntry(input: CreateTimeEntryInput) {
  const [row] = await db
    .insert(timeEntries)
    .values({
      projectId: input.projectId,
      description: input.description,
      hours: String(input.hours),
      workedAt: input.workedAt,
    })
    .returning();
  return row;
}

export async function queryTimeEntries(filters: {
  projectId?: string;
  from?: string;
  to?: string;
}) {
  const conditions = [];
  if (filters.projectId) conditions.push(eq(timeEntries.projectId, filters.projectId));
  if (filters.from) conditions.push(gte(timeEntries.workedAt, filters.from));
  if (filters.to) conditions.push(lte(timeEntries.workedAt, filters.to));

  return db
    .select()
    .from(timeEntries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(timeEntries.workedAt));
}

// --- Invoices ---

interface CreateInvoiceInput {
  clientId: string;
  projectId?: string;
  amount: number;
  currency: string;
  status: string;
  issuedAt?: string;
  paidAt?: string;
  metadata?: Record<string, unknown>;
}

export async function createInvoice(input: CreateInvoiceInput) {
  const [row] = await db
    .insert(invoices)
    .values({
      clientId: input.clientId,
      projectId: input.projectId,
      amount: String(input.amount),
      currency: input.currency,
      status: input.status,
      issuedAt: input.issuedAt,
      paidAt: input.paidAt,
      metadata: input.metadata,
    })
    .returning();
  return row;
}

export async function queryInvoices(filters: { clientId?: string; status?: string }) {
  const conditions = [];
  if (filters.clientId) conditions.push(eq(invoices.clientId, filters.clientId));
  if (filters.status) conditions.push(eq(invoices.status, filters.status));

  return db
    .select()
    .from(invoices)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(invoices.createdAt));
}

// --- Expenses ---

interface CreateExpenseInput {
  category?: string;
  description?: string;
  amount: number;
  currency: string;
  incurredAt: string;
  taxDeductible?: boolean;
  metadata?: Record<string, unknown>;
}

export async function createExpense(input: CreateExpenseInput) {
  const [row] = await db
    .insert(expenses)
    .values({
      category: input.category,
      description: input.description,
      amount: String(input.amount),
      currency: input.currency,
      incurredAt: input.incurredAt,
      taxDeductible: input.taxDeductible,
      metadata: input.metadata,
    })
    .returning();
  return row;
}

export async function queryExpenses(filters: {
  category?: string;
  from?: string;
  to?: string;
}) {
  const conditions = [];
  if (filters.category) conditions.push(eq(expenses.category, filters.category));
  if (filters.from) conditions.push(gte(expenses.incurredAt, filters.from));
  if (filters.to) conditions.push(lte(expenses.incurredAt, filters.to));

  return db
    .select()
    .from(expenses)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(expenses.incurredAt));
}
