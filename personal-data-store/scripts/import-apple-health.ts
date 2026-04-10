import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../src/db/index.js";
import { healthMetrics, workouts } from "../src/domains/health/health.schema.js";

const SOURCE = "apple_health";

function parseDate(dateStr: string): Date {
  // Format: "2024-08-15 00:00:00 +0800"
  return new Date(dateStr);
}

async function importMetrics(metrics: any[]) {
  let imported = 0;
  let skipped = 0;

  for (const metric of metrics) {
    const metricType = metric.name;
    const unit = metric.units;

    for (const point of metric.data) {
      if (point.qty == null) { skipped++; continue; }

      try {
        const inserted = await db.insert(healthMetrics).values({
          source: SOURCE,
          metricType,
          value: String(point.qty),
          unit,
          recordedAt: parseDate(point.date),
          metadata: point.source ? { deviceSource: point.source } : undefined,
        }).onConflictDoNothing().returning({ id: healthMetrics.id });

        if (inserted.length) imported++;
        else skipped++;
      } catch (err) {
        skipped++;
      }
    }

    console.log(`  ${metricType}: done`);
  }

  return { imported, skipped };
}

async function importWorkouts(workoutList: any[]) {
  let imported = 0;
  let skipped = 0;

  for (const w of workoutList) {
    if (!w.start || !w.end) { skipped++; continue; }

    try {
      const metadata: Record<string, any> = {};
      if (w.temperature) metadata.temperature = w.temperature;
      if (w.humidity) metadata.humidity = w.humidity;
      if (w.elevationUp) metadata.elevationUp = w.elevationUp;
      if (w.speed) metadata.speed = w.speed;
      if (w.stepCadence) metadata.stepCadence = w.stepCadence;
      if (w.intensity) metadata.intensity = w.intensity;
      if (w.heartRate) metadata.heartRate = w.heartRate;
      if (w.stepCount) metadata.stepCountSamples = w.stepCount.length;
      if (w.heartRateData) metadata.heartRateSamples = w.heartRateData.length;
      if (w.heartRateRecovery) metadata.heartRateRecovery = w.heartRateRecovery;
      if (w.swimStyle) metadata.swimStyle = w.swimStyle;

      const inserted = await db.insert(workouts).values({
        externalId: w.id || null,
        name: w.name,
        source: SOURCE,
        startedAt: parseDate(w.start),
        endedAt: parseDate(w.end),
        duration: w.duration != null ? String(w.duration) : null,
        distance: w.distance?.qty != null ? String(w.distance.qty) : null,
        distanceUnit: w.distance?.units || null,
        activeEnergy: w.activeEnergyBurned?.qty != null ? String(w.activeEnergyBurned.qty) : null,
        activeEnergyUnit: w.activeEnergyBurned?.units || null,
        avgHeartRate: w.avgHeartRate?.qty != null ? String(w.avgHeartRate.qty) : null,
        maxHeartRate: w.maxHeartRate?.qty != null ? String(w.maxHeartRate.qty) : null,
        location: w.location || null,
        isIndoor: w.isIndoor ?? null,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
        route: w.route?.length ? w.route : null,
      }).onConflictDoNothing().returning({ id: workouts.id });

      if (inserted.length) imported++;
      else skipped++;
    } catch (err) {
      console.error(`  Failed workout ${w.name} ${w.start}: ${(err as Error).message}`);
      skipped++;
    }
  }

  return { imported, skipped };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx scripts/import-apple-health.ts <path-to-json>");
    process.exit(1);
  }

  console.log(`Reading ${filePath}...`);
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  const data = raw.data;

  console.log(`\nImporting ${data.metrics.length} metric types...`);
  const metricResult = await importMetrics(data.metrics);
  console.log(`Metrics: ${metricResult.imported} imported, ${metricResult.skipped} skipped/duplicates`);

  if (data.workouts?.length) {
    console.log(`\nImporting ${data.workouts.length} workouts...`);
    const workoutResult = await importWorkouts(data.workouts);
    console.log(`Workouts: ${workoutResult.imported} imported, ${workoutResult.skipped} skipped/duplicates`);
  } else {
    console.log("\nNo workouts in this export.");
  }

  console.log("\nDone.");
  process.exit(0);
}

main();
