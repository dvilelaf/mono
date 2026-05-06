import { db } from "../../db/index.js";
import { healthMetrics, supplements, nutritionEntries, workouts } from "./health.schema.js";
import { eq, and, gte, lte, desc, ilike, sql } from "drizzle-orm";

interface CreateMetricInput {
  source: string;
  metricType: string;
  value: number;
  unit: string;
  recordedAt: string;
  metadata?: Record<string, unknown>;
}

export async function createMetric(input: CreateMetricInput) {
  const [row] = await db
    .insert(healthMetrics)
    .values({
      source: input.source,
      metricType: input.metricType,
      value: String(input.value),
      unit: input.unit,
      recordedAt: new Date(input.recordedAt),
      metadata: input.metadata,
    })
    .returning();
  return row;
}

export async function queryMetrics(filters: {
  type?: string;
  source?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const conditions = [];
  if (filters.type) conditions.push(eq(healthMetrics.metricType, filters.type));
  if (filters.source) conditions.push(eq(healthMetrics.source, filters.source));
  if (filters.from) conditions.push(gte(healthMetrics.recordedAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(healthMetrics.recordedAt, new Date(filters.to)));

  return db
    .select()
    .from(healthMetrics)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(healthMetrics.recordedAt))
    .limit(filters.limit ?? 1000);
}

export async function queryMetricsPaginated(filters: {
  search?: string;
  source?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filters.search) conditions.push(ilike(healthMetrics.metricType, `%${filters.search}%`));
  if (filters.source) conditions.push(eq(healthMetrics.source, filters.source));
  if (filters.from) conditions.push(gte(healthMetrics.recordedAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(healthMetrics.recordedAt, new Date(filters.to)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Dedup display-side: collapse rows that share (source, metric_type, value, recorded_at).
  const deduped = db
    .selectDistinctOn(
      [healthMetrics.source, healthMetrics.metricType, healthMetrics.value, healthMetrics.recordedAt],
      {
        id: healthMetrics.id,
        source: healthMetrics.source,
        metricType: healthMetrics.metricType,
        value: healthMetrics.value,
        unit: healthMetrics.unit,
        recordedAt: healthMetrics.recordedAt,
        metadata: healthMetrics.metadata,
      },
    )
    .from(healthMetrics)
    .where(where)
    .orderBy(
      healthMetrics.source,
      healthMetrics.metricType,
      healthMetrics.value,
      healthMetrics.recordedAt,
    )
    .as("deduped");

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(deduped)
      .orderBy(desc(deduped.recordedAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(deduped),
  ]);
  const total = totalRow[0]?.count ?? 0;

  return { rows, total, page, pageSize };
}

export async function latestMetric(type: string) {
  const [row] = await db
    .select()
    .from(healthMetrics)
    .where(eq(healthMetrics.metricType, type))
    .orderBy(desc(healthMetrics.recordedAt))
    .limit(1);
  return row || null;
}

interface CreateSupplementInput {
  name: string;
  dosage?: string;
  unit?: string;
  takenAt: string;
  source: string;
  metadata?: Record<string, unknown>;
}

export async function createSupplement(input: CreateSupplementInput) {
  const [row] = await db
    .insert(supplements)
    .values({
      name: input.name,
      dosage: input.dosage,
      unit: input.unit,
      takenAt: new Date(input.takenAt),
      source: input.source,
      metadata: input.metadata,
    })
    .returning();
  return row;
}

export async function querySupplements(filters: { from?: string; to?: string }) {
  const conditions = [];
  if (filters.from) conditions.push(gte(supplements.takenAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(supplements.takenAt, new Date(filters.to)));

  return db
    .select()
    .from(supplements)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supplements.takenAt));
}

export async function queryNutrition(filters: { from?: string; to?: string }) {
  const conditions = [];
  if (filters.from) conditions.push(gte(nutritionEntries.recordedAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(nutritionEntries.recordedAt, new Date(filters.to)));

  return db
    .select()
    .from(nutritionEntries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(nutritionEntries.recordedAt));
}

export async function queryWorkouts(filters: { name?: string; from?: string; to?: string; limit?: number }) {
  const conditions = [];
  if (filters.name) conditions.push(eq(workouts.name, filters.name));
  if (filters.from) conditions.push(gte(workouts.startedAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(workouts.startedAt, new Date(filters.to)));

  return db
    .select({
      id: workouts.id,
      name: workouts.name,
      source: workouts.source,
      startedAt: workouts.startedAt,
      endedAt: workouts.endedAt,
      duration: workouts.duration,
      distance: workouts.distance,
      distanceUnit: workouts.distanceUnit,
      activeEnergy: workouts.activeEnergy,
      avgHeartRate: workouts.avgHeartRate,
      maxHeartRate: workouts.maxHeartRate,
      location: workouts.location,
      isIndoor: workouts.isIndoor,
      metadata: workouts.metadata,
    })
    .from(workouts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(workouts.startedAt))
    .limit(filters.limit ?? 100);
}
