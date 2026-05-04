import { db } from "../../db/index.js";
import { workouts } from "../health/health.schema.js";
import { eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

export interface WorkoutSet {
  exercise: string;
  reps: number | null;
  weight: number | null;
  seconds: number | null;
  setOrder: number;
}

interface CreateWorkoutInput {
  name: string;
  startedAt: string;
  sets?: WorkoutSet[];
}

interface UpdateWorkoutInput {
  name?: string;
  endedAt?: string;
  duration?: number;
  sets?: WorkoutSet[];
}

export async function createWorkout(input: CreateWorkoutInput) {
  const [row] = await db
    .insert(workouts)
    .values({
      name: input.name,
      source: "manual",
      startedAt: new Date(input.startedAt),
      endedAt: new Date(input.startedAt),
      metadata: { sets: input.sets ?? [] },
    })
    .returning();
  return row;
}

export async function updateWorkout(id: string, input: UpdateWorkoutInput) {
  const [existing] = await db.select().from(workouts).where(eq(workouts.id, id)).limit(1);
  if (!existing) return null;

  const currentMeta = (existing.metadata as { sets?: WorkoutSet[] }) ?? {};
  const updates: Record<string, unknown> = {};

  if (input.name !== undefined) updates.name = input.name;
  if (input.endedAt !== undefined) updates.ended_at = new Date(input.endedAt);
  if (input.duration !== undefined) updates.duration = String(input.duration);
  if (input.sets !== undefined) updates.metadata = { ...currentMeta, sets: input.sets };

  const [row] = await db
    .update(workouts)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.endedAt !== undefined ? { endedAt: new Date(input.endedAt) } : {}),
      ...(input.duration !== undefined ? { duration: String(input.duration) } : {}),
      ...(input.sets !== undefined ? { metadata: { ...currentMeta, sets: input.sets } } : {}),
    })
    .where(eq(workouts.id, id))
    .returning();
  return row;
}

export async function getWorkout(id: string) {
  const [row] = await db.select().from(workouts).where(eq(workouts.id, id)).limit(1);
  return row ?? null;
}

export async function listWorkouts(limit = 50) {
  return db.select().from(workouts).orderBy(desc(workouts.startedAt)).limit(limit);
}

export async function getExerciseNames(): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT jsonb_array_elements(metadata->'sets')->>'exercise' AS exercise
    FROM workouts
    WHERE metadata ? 'sets'
      AND jsonb_array_length(metadata->'sets') > 0
    ORDER BY exercise
  `);
  return (result as unknown as Array<{ exercise: string }>)
    .map((r) => r.exercise)
    .filter(Boolean);
}
