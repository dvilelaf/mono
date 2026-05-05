import { db } from "../../db/index.js";
import { supplementStack, adherenceMisses } from "./checkin.schema.js";
import { supplements, healthMetrics, nutritionEntries } from "../health/health.schema.js";
import { and, eq, gte, lte, sql } from "drizzle-orm";

const CHECKIN_SOURCE = "checkin";

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function parseDay(input?: string): Date {
  if (!input) return new Date();
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

export interface StackItem {
  id: string;
  name: string;
  dosage: string | null;
  unit: string | null;
  schedule: string | null;
  active: boolean;
  sortOrder: number;
  notes: string | null;
}

export async function listStack(opts?: { activeOnly?: boolean }): Promise<StackItem[]> {
  const where = opts?.activeOnly ? eq(supplementStack.active, true) : undefined;
  const rows = await db
    .select()
    .from(supplementStack)
    .where(where)
    .orderBy(supplementStack.sortOrder, supplementStack.name);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    dosage: r.dosage,
    unit: r.unit,
    schedule: r.schedule,
    active: r.active,
    sortOrder: r.sortOrder,
    notes: r.notes,
  }));
}

export async function upsertStackItem(input: {
  name: string;
  dosage?: string | null;
  unit?: string | null;
  schedule?: string | null;
  active?: boolean;
  sortOrder?: number;
  notes?: string | null;
}): Promise<StackItem> {
  const [row] = await db
    .insert(supplementStack)
    .values({
      name: input.name,
      dosage: input.dosage ?? null,
      unit: input.unit ?? null,
      schedule: input.schedule ?? null,
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? 0,
      notes: input.notes ?? null,
    })
    .onConflictDoUpdate({
      target: supplementStack.name,
      set: {
        dosage: input.dosage ?? null,
        unit: input.unit ?? null,
        schedule: input.schedule ?? null,
        active: input.active ?? true,
        sortOrder: input.sortOrder ?? 0,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return {
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    unit: row.unit,
    schedule: row.schedule,
    active: row.active,
    sortOrder: row.sortOrder,
    notes: row.notes,
  };
}

export async function updateStackItem(
  id: string,
  patch: Partial<{
    name: string;
    dosage: string | null;
    unit: string | null;
    schedule: string | null;
    active: boolean;
    sortOrder: number;
    notes: string | null;
  }>,
): Promise<StackItem | null> {
  const [row] = await db
    .update(supplementStack)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(supplementStack.id, id))
    .returning();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    unit: row.unit,
    schedule: row.schedule,
    active: row.active,
    sortOrder: row.sortOrder,
    notes: row.notes,
  };
}

export async function deleteStackItem(id: string): Promise<boolean> {
  const rows = await db.delete(supplementStack).where(eq(supplementStack.id, id)).returning();
  return rows.length > 0;
}

export interface SupplementCheckinInput {
  name: string;
  taken: boolean;
  takenAt?: string;
  dosage?: string | null;
  unit?: string | null;
  notes?: string | null;
}

export async function recordSupplementCheckin(input: SupplementCheckinInput) {
  const day = parseDay(input.takenAt);
  const dayStart = startOfDayUTC(day);
  const dayEnd = endOfDayUTC(day);

  await db
    .delete(supplements)
    .where(
      and(
        eq(supplements.name, input.name),
        eq(supplements.source, CHECKIN_SOURCE),
        gte(supplements.takenAt, dayStart),
        lte(supplements.takenAt, dayEnd),
      ),
    );

  if (!input.taken) {
    return { name: input.name, taken: false, day: dayStart.toISOString().slice(0, 10) };
  }

  const [row] = await db
    .insert(supplements)
    .values({
      name: input.name,
      dosage: input.dosage ?? null,
      unit: input.unit ?? null,
      takenAt: input.takenAt ? new Date(input.takenAt) : new Date(),
      source: CHECKIN_SOURCE,
      metadata: input.notes ? { notes: input.notes } : null,
    })
    .returning();
  return { ...row, taken: true, day: dayStart.toISOString().slice(0, 10) };
}

export async function todaySupplementStatus(day?: string): Promise<
  Array<StackItem & { takenToday: boolean; takenAt: string | null }>
> {
  const stack = await listStack({ activeOnly: true });
  const target = parseDay(day);
  const dayStart = startOfDayUTC(target);
  const dayEnd = endOfDayUTC(target);

  const todays = await db
    .select()
    .from(supplements)
    .where(and(gte(supplements.takenAt, dayStart), lte(supplements.takenAt, dayEnd)));

  const byName = new Map<string, (typeof todays)[number]>();
  for (const row of todays) {
    if (!byName.has(row.name)) byName.set(row.name, row);
  }

  return stack.map((item) => {
    const hit = byName.get(item.name) ?? null;
    return {
      ...item,
      takenToday: !!hit,
      takenAt: hit ? hit.takenAt.toISOString() : null,
    };
  });
}

export interface MeasurementInput {
  metricType: string;
  value: number;
  unit: string;
  recordedAt?: string;
  notes?: string | null;
}

export async function recordMeasurement(input: MeasurementInput) {
  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
  const [row] = await db
    .insert(healthMetrics)
    .values({
      source: CHECKIN_SOURCE,
      metricType: input.metricType,
      value: String(input.value),
      unit: input.unit,
      recordedAt,
      metadata: input.notes ? { notes: input.notes } : null,
    })
    .onConflictDoUpdate({
      target: [healthMetrics.source, healthMetrics.metricType, healthMetrics.recordedAt],
      set: {
        value: String(input.value),
        unit: input.unit,
        metadata: input.notes ? { notes: input.notes } : null,
      },
    })
    .returning();
  return row;
}

export interface NutritionInput {
  mealType?: string | null;
  foods?: unknown;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  recordedAt?: string;
  notes?: string | null;
}

export async function recordNutrition(input: NutritionInput) {
  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
  const foods =
    input.foods !== undefined
      ? input.foods
      : input.notes
        ? { notes: input.notes }
        : null;
  const [row] = await db
    .insert(nutritionEntries)
    .values({
      mealType: input.mealType ?? null,
      foods: foods as object | null,
      calories: input.calories === null || input.calories === undefined ? null : String(input.calories),
      protein: input.protein === null || input.protein === undefined ? null : String(input.protein),
      carbs: input.carbs === null || input.carbs === undefined ? null : String(input.carbs),
      fat: input.fat === null || input.fat === undefined ? null : String(input.fat),
      recordedAt,
      source: CHECKIN_SOURCE,
    })
    .returning();
  return row;
}

export async function checkinSummary(day?: string) {
  const target = parseDay(day);
  const dayStart = startOfDayUTC(target);
  const dayEnd = endOfDayUTC(target);
  const dayKey = dayStart.toISOString().slice(0, 10);

  const stackStatus = await todaySupplementStatus(dayKey);
  const totalActive = stackStatus.length;
  const taken = stackStatus.filter((s) => s.takenToday).length;

  const measurements = await db
    .select()
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.source, CHECKIN_SOURCE),
        gte(healthMetrics.recordedAt, dayStart),
        lte(healthMetrics.recordedAt, dayEnd),
      ),
    );

  const nutrition = await db
    .select()
    .from(nutritionEntries)
    .where(
      and(
        eq(nutritionEntries.source, CHECKIN_SOURCE),
        gte(nutritionEntries.recordedAt, dayStart),
        lte(nutritionEntries.recordedAt, dayEnd),
      ),
    );

  const submitted = totalActive > 0 ? taken > 0 : false;
  const hasMeasurement = measurements.length > 0;
  const hasNutrition = nutrition.length > 0;
  const complete = (submitted || totalActive === 0) && (hasMeasurement || hasNutrition);

  return {
    day: dayKey,
    supplements: { stack: stackStatus, totalActive, taken },
    measurements,
    nutrition,
    submitted,
    complete,
  };
}

export async function isDayComplete(day?: string): Promise<boolean> {
  const summary = await checkinSummary(day);
  return summary.complete;
}

export async function recordMissedDay(day: string, category = "checkin", notes?: string) {
  const [row] = await db
    .insert(adherenceMisses)
    .values({ missDate: day, category, notes: notes ?? null })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function listMisses(limit = 30) {
  return db.select().from(adherenceMisses).orderBy(sql`${adherenceMisses.missDate} desc`).limit(limit);
}
