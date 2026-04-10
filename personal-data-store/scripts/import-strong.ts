import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../src/db/index.js";
import { workouts } from "../src/domains/health/health.schema.js";

const SOURCE = "strong";

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseDuration(dur: string): number | null {
  // "39m" or "1h 5m" or "55m"
  let totalSeconds = 0;
  const hMatch = dur.match(/(\d+)h/);
  const mMatch = dur.match(/(\d+)m/);
  if (hMatch) totalSeconds += parseInt(hMatch[1]) * 3600;
  if (mMatch) totalSeconds += parseInt(mMatch[1]) * 60;
  return totalSeconds || null;
}

interface SetData {
  exercise: string;
  setOrder: number;
  weight: number | null;
  reps: number | null;
  distance: number | null;
  seconds: number | null;
  rpe: number | null;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx scripts/import-strong.ts <path-to-csv>");
    process.exit(1);
  }

  const lines = readFileSync(filePath, "utf-8").split("\n").filter(l => l.trim());
  const header = parseCsvLine(lines[0]);
  const idx = {
    date: header.indexOf("Date"),
    name: header.indexOf("Workout Name"),
    duration: header.indexOf("Duration"),
    exercise: header.indexOf("Exercise Name"),
    setOrder: header.indexOf("Set Order"),
    weight: header.indexOf("Weight"),
    reps: header.indexOf("Reps"),
    distance: header.indexOf("Distance"),
    seconds: header.indexOf("Seconds"),
    rpe: header.indexOf("RPE"),
  };

  // Group sets by workout (date + name)
  const workoutMap = new Map<string, { date: string; name: string; duration: string; sets: SetData[] }>();

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const date = fields[idx.date]?.trim();
    const name = fields[idx.name]?.trim();
    if (!date || !name) continue;

    const key = `${date}|${name}`;
    if (!workoutMap.has(key)) {
      workoutMap.set(key, { date, name, duration: fields[idx.duration]?.trim() || "", sets: [] });
    }

    workoutMap.get(key)!.sets.push({
      exercise: fields[idx.exercise]?.trim() || "",
      setOrder: parseInt(fields[idx.setOrder]) || 0,
      weight: fields[idx.weight] ? parseFloat(fields[idx.weight]) || null : null,
      reps: fields[idx.reps] ? parseFloat(fields[idx.reps]) || null : null,
      distance: fields[idx.distance] ? parseFloat(fields[idx.distance]) || null : null,
      seconds: fields[idx.seconds] ? parseFloat(fields[idx.seconds]) || null : null,
      rpe: fields[idx.rpe] ? parseFloat(fields[idx.rpe]) || null : null,
    });
  }

  console.log(`Found ${workoutMap.size} workouts from ${lines.length - 1} sets`);

  let imported = 0;
  let skipped = 0;

  for (const [key, w] of workoutMap) {
    const startedAt = new Date(w.date);
    const durationSec = parseDuration(w.duration);
    const endedAt = durationSec ? new Date(startedAt.getTime() + durationSec * 1000) : startedAt;
    const externalId = `strong:${key}`;

    // Summarize exercises
    const exercises: Record<string, { sets: number; maxWeight: number | null; totalReps: number }> = {};
    for (const s of w.sets) {
      if (!exercises[s.exercise]) exercises[s.exercise] = { sets: 0, maxWeight: null, totalReps: 0 };
      const ex = exercises[s.exercise];
      ex.sets++;
      if (s.weight != null && (ex.maxWeight == null || s.weight > ex.maxWeight)) ex.maxWeight = s.weight;
      if (s.reps != null) ex.totalReps += s.reps;
    }

    try {
      const inserted = await db.insert(workouts).values({
        externalId,
        name: w.name,
        source: SOURCE,
        startedAt,
        endedAt,
        duration: durationSec ? String(durationSec) : null,
        metadata: {
          exercises,
          totalSets: w.sets.length,
          sets: w.sets,
        },
      }).onConflictDoNothing().returning({ id: workouts.id });

      if (inserted.length) imported++;
      else skipped++;
    } catch (err) {
      console.error(`Failed: ${key}: ${(err as Error).message}`);
      skipped++;
    }
  }

  console.log(`Done: ${imported} imported, ${skipped} skipped/duplicates`);
  process.exit(0);
}

main();
