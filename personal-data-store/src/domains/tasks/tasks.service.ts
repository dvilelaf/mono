import { db } from "../../db/index.js";
import { tasks } from "./tasks.schema.js";
import { goals } from "../goals/goals.schema.js";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

export type TaskStatus = "open" | "done" | "snoozed" | "cancelled";

export interface CreateTaskInput {
  slug: string;
  title: string;
  source?: string;
  sourcePath?: string | null;
  goalSlug?: string | null;
  status?: TaskStatus | string;
  priority?: number;
  dueDate?: string | null;
  smallestNextAction?: string | null;
  evidenceQuery?: Record<string, unknown> | null;
  notes?: string | null;
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  status?: TaskStatus | string;
  completedAt?: string | null;
  completedBy?: string | null;
}

async function resolveGoalId(goalSlug: string | null | undefined): Promise<string | null> {
  if (!goalSlug) return null;
  const [row] = await db.select({ id: goals.id }).from(goals).where(eq(goals.slug, goalSlug)).limit(1);
  return row?.id ?? null;
}

export async function listTasks(filters?: { status?: string; goalSlug?: string }) {
  const conds = [];
  if (filters?.status) conds.push(eq(tasks.status, filters.status));
  if (filters?.goalSlug) conds.push(eq(tasks.goalSlug, filters.goalSlug));
  const q = db.select().from(tasks);
  return conds.length
    ? await q.where(and(...conds)).orderBy(asc(tasks.priority), desc(tasks.createdAt))
    : await q.orderBy(asc(tasks.priority), desc(tasks.createdAt));
}

export async function listTopOpenTasks(limit = 3) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.status, "open"))
    .orderBy(asc(tasks.priority), desc(tasks.createdAt))
    .limit(limit);
}

export async function getTaskBySlug(slug: string) {
  const [row] = await db.select().from(tasks).where(eq(tasks.slug, slug)).limit(1);
  return row ?? null;
}

export async function getTaskById(id: string) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return row ?? null;
}

export async function createTask(input: CreateTaskInput) {
  const goalId = await resolveGoalId(input.goalSlug ?? null);
  const [row] = await db
    .insert(tasks)
    .values({
      slug: input.slug,
      title: input.title,
      source: input.source ?? "manual",
      sourcePath: input.sourcePath ?? null,
      goalSlug: input.goalSlug ?? null,
      goalId,
      status: input.status ?? "open",
      priority: input.priority ?? 3,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      smallestNextAction: input.smallestNextAction ?? null,
      evidenceQuery: (input.evidenceQuery ?? null) as never,
      notes: input.notes ?? null,
    })
    .returning();
  return row;
}

export async function upsertTaskBySlug(input: CreateTaskInput) {
  const goalId = await resolveGoalId(input.goalSlug ?? null);
  const values = {
    slug: input.slug,
    title: input.title,
    source: input.source ?? "manual",
    sourcePath: input.sourcePath ?? null,
    goalSlug: input.goalSlug ?? null,
    goalId,
    status: input.status ?? "open",
    priority: input.priority ?? 3,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    smallestNextAction: input.smallestNextAction ?? null,
    evidenceQuery: (input.evidenceQuery ?? null) as never,
    notes: input.notes ?? null,
  };
  const [row] = await db
    .insert(tasks)
    .values(values)
    .onConflictDoUpdate({
      target: tasks.slug,
      // Only refresh fields that should track the source-of-truth.
      // Don't clobber status/completedAt/notes the user has changed locally.
      set: {
        title: values.title,
        source: values.source,
        sourcePath: values.sourcePath,
        goalSlug: values.goalSlug,
        goalId,
        priority: values.priority,
        smallestNextAction: values.smallestNextAction,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function updateTask(slug: string, input: UpdateTaskInput) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.status !== undefined) patch.status = input.status;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.smallestNextAction !== undefined) patch.smallestNextAction = input.smallestNextAction;
  if (input.evidenceQuery !== undefined) patch.evidenceQuery = input.evidenceQuery;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.goalSlug !== undefined) {
    patch.goalSlug = input.goalSlug;
    patch.goalId = await resolveGoalId(input.goalSlug ?? null);
  }
  if (input.completedAt !== undefined) patch.completedAt = input.completedAt ? new Date(input.completedAt) : null;
  if (input.completedBy !== undefined) patch.completedBy = input.completedBy;
  const [row] = await db.update(tasks).set(patch).where(eq(tasks.slug, slug)).returning();
  return row ?? null;
}

export async function markTaskDone(slug: string, completedBy?: string | null) {
  const [row] = await db
    .update(tasks)
    .set({
      status: "done",
      completedAt: new Date(),
      completedBy: completedBy ?? null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.slug, slug))
    .returning();
  return row ?? null;
}

export async function reopenTask(slug: string) {
  const [row] = await db
    .update(tasks)
    .set({
      status: "open",
      completedAt: null,
      completedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.slug, slug))
    .returning();
  return row ?? null;
}

export async function countOpenTasks(): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.status, "open"));
  return row?.c ?? 0;
}

export async function listTasksByGoalSlug(goalSlug: string) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.goalSlug, goalSlug))
    .orderBy(asc(tasks.status), asc(tasks.priority), desc(tasks.createdAt));
}

export async function backfillGoalIds(): Promise<number> {
  const rows = await db
    .select({ id: tasks.id, goalSlug: tasks.goalSlug })
    .from(tasks)
    .where(and(isNull(tasks.goalId), sql`${tasks.goalSlug} is not null`));
  let updated = 0;
  for (const r of rows) {
    const id = await resolveGoalId(r.goalSlug);
    if (id) {
      await db.update(tasks).set({ goalId: id, updatedAt: new Date() }).where(eq(tasks.id, r.id));
      updated++;
    }
  }
  return updated;
}
