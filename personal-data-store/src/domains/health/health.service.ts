import { db } from "../../db/index.js";
import { healthMetrics, supplements, nutritionEntries } from "./health.schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";

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
    .orderBy(desc(healthMetrics.recordedAt));
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
