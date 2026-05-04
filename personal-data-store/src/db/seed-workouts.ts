import { db } from "./index.js";
import { documents } from "../domains/documents/documents.schema.js";
import { eq, and } from "drizzle-orm";

const MOBILITY = [
  { name: "Body Weight Hang", sets: 2, reps: null, seconds: null },
  { name: "Deep Squat Hold", sets: 2, reps: null, seconds: 60 },
  { name: "Wall Slides", sets: 2, reps: 10, seconds: null },
  { name: "Thoracic Rotation", sets: 2, reps: 10, seconds: null },
  { name: "One Foot Balance", sets: 2, reps: null, seconds: 90 },
];

const TEMPLATES = [
  {
    title: "Session A - Push + Legs",
    exercises: [
      { name: "Leg Press", sets: 4, reps: 8, seconds: null },
      { name: "Leg Extension", sets: 3, reps: 12, seconds: null },
      { name: "Shoulder Press", sets: 3, reps: 8, seconds: null },
      { name: "Chest Press", sets: 3, reps: 10, seconds: null },
      { name: "Cable Lateral Raise", sets: 3, reps: 15, seconds: null },
      { name: "Tricep Pushdown", sets: 3, reps: 12, seconds: null },
      ...MOBILITY,
    ],
  },
  {
    title: "Session B - Pull + Legs",
    exercises: [
      { name: "Leg Curl", sets: 4, reps: 10, seconds: null },
      { name: "Hip Thrust", sets: 3, reps: 10, seconds: null },
      { name: "Lat Pulldown", sets: 4, reps: 8, seconds: null },
      { name: "Seated Row", sets: 3, reps: 10, seconds: null },
      { name: "Reverse Fly", sets: 3, reps: 10, seconds: null },
      { name: "Face Pull", sets: 2, reps: 15, seconds: null },
      { name: "DB Curl", sets: 3, reps: 12, seconds: null },
      ...MOBILITY,
    ],
  },
];

export async function seedWorkoutTemplates() {
  for (const template of TEMPLATES) {
    const [existing] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.type, "workout_template"), eq(documents.title, template.title)))
      .limit(1);

    if (!existing) {
      await db.insert(documents).values({
        domain: "health",
        type: "workout_template",
        title: template.title,
        content: template.title,
        metadata: { exercises: template.exercises },
      });
      console.log(`Seeded template: ${template.title}`);
    } else {
      await db
        .update(documents)
        .set({ metadata: { exercises: template.exercises } })
        .where(eq(documents.id, existing.id));
      console.log(`Updated template: ${template.title}`);
    }
  }
}
