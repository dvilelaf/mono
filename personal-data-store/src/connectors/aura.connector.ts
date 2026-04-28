import type { Connector, SyncResult, SyncOptions } from "./connector.interface.js";
import { db } from "../db/index.js";
import { healthMetrics, workouts } from "../domains/health/health.schema.js";

const OURA_BASE_URL = "https://api.ouraring.com/v2/usercollection";

interface OuraPage<T> {
  data?: T[];
  next_token?: string | null;
}

async function ouraFetchRaw(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const token = process.env.OURA_ACCESS_TOKEN;
  if (!token) throw new Error("OURA_ACCESS_TOKEN not configured");
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${OURA_BASE_URL}/${path}?${qs}` : `${OURA_BASE_URL}/${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Oura API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function ouraFetchAll<T>(endpoint: string, params: Record<string, string>): Promise<T[]> {
  const all: T[] = [];
  let next: string | null | undefined;
  do {
    const merged = next ? { ...params, next_token: next } : params;
    const page = (await ouraFetchRaw(endpoint, merged)) as OuraPage<T>;
    if (page.data) all.push(...page.data);
    next = page.next_token ?? null;
  } while (next);
  return all;
}

function dateRange(start: string, end: string) {
  return { start_date: start, end_date: end };
}

function datetimeRange(start: string, end: string) {
  return {
    start_datetime: `${start}T00:00:00+00:00`,
    end_datetime: `${end}T23:59:59+00:00`,
  };
}

function parseTs(ts: string | undefined | null): Date | null {
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

interface MetricInsert {
  metricType: string;
  value: number | string | null | undefined;
  unit: string;
  recordedAt: Date | null;
  metadata?: unknown;
}

async function insertMetric(m: MetricInsert): Promise<number> {
  if (m.value == null) return 0;
  if (typeof m.value === "number" && !Number.isFinite(m.value)) return 0;
  if (!m.recordedAt || isNaN(m.recordedAt.getTime())) return 0;
  const inserted = await db
    .insert(healthMetrics)
    .values({
      source: "aura",
      metricType: m.metricType,
      value: String(m.value),
      unit: m.unit,
      recordedAt: m.recordedAt,
      metadata: (m.metadata ?? null) as never,
    })
    .onConflictDoNothing()
    .returning({ id: healthMetrics.id });
  return inserted.length;
}

const RESILIENCE_LEVEL_MAP: Record<string, number> = {
  limited: 1,
  adequate: 2,
  solid: 3,
  strong: 4,
  exceptional: 5,
};

// ----- Endpoint handlers --------------------------------------------------

async function syncDailySleep(start: string, end: string) {
  const data = await ouraFetchAll<{
    day: string;
    score: number | null;
    timestamp?: string;
    contributors?: Record<string, number>;
  }>("daily_sleep", dateRange(start, end));
  let n = 0;
  for (const e of data) {
    const ts = parseTs(e.timestamp) ?? parseTs(e.day);
    n += await insertMetric({
      metricType: "sleep_score",
      value: e.score,
      unit: "score",
      recordedAt: ts,
      metadata: { contributors: e.contributors },
    });
    if (e.contributors) {
      for (const [k, v] of Object.entries(e.contributors)) {
        n += await insertMetric({
          metricType: `sleep_contrib_${k}`,
          value: v,
          unit: "score",
          recordedAt: ts,
        });
      }
    }
  }
  return n;
}

async function syncDailyActivity(start: string, end: string) {
  const data = await ouraFetchAll<{
    day: string;
    timestamp?: string;
    score: number | null;
    steps: number | null;
    active_calories: number | null;
    total_calories: number | null;
    equivalent_walking_distance: number | null;
    high_activity_time: number | null;
    medium_activity_time: number | null;
    low_activity_time: number | null;
    sedentary_time: number | null;
    resting_time: number | null;
    non_wear_time: number | null;
    target_calories: number | null;
    target_meters: number | null;
    meters_to_target: number | null;
    inactivity_alerts: number | null;
    average_met_minutes: number | null;
    contributors?: Record<string, number>;
  }>("daily_activity", dateRange(start, end));
  let n = 0;
  for (const e of data) {
    const ts = parseTs(e.timestamp) ?? parseTs(e.day);
    const fields: Array<[string, number | null | undefined, string]> = [
      ["activity_score", e.score, "score"],
      ["steps", e.steps, "steps"],
      ["active_calories", e.active_calories, "kcal"],
      ["total_calories", e.total_calories, "kcal"],
      ["equivalent_walking_distance", e.equivalent_walking_distance, "m"],
      ["high_activity_time", e.high_activity_time, "s"],
      ["medium_activity_time", e.medium_activity_time, "s"],
      ["low_activity_time", e.low_activity_time, "s"],
      ["sedentary_time", e.sedentary_time, "s"],
      ["resting_time", e.resting_time, "s"],
      ["non_wear_time", e.non_wear_time, "s"],
      ["target_calories", e.target_calories, "kcal"],
      ["target_meters", e.target_meters, "m"],
      ["meters_to_target", e.meters_to_target, "m"],
      ["inactivity_alerts", e.inactivity_alerts, "count"],
      ["average_met_minutes", e.average_met_minutes, "MET-min"],
    ];
    for (const [type, value, unit] of fields) {
      // Only the first (activity_score) gets full metadata so we can reconstruct contributors.
      const metadata = type === "activity_score" ? { contributors: e.contributors } : undefined;
      n += await insertMetric({ metricType: type, value, unit, recordedAt: ts, metadata });
    }
    if (e.contributors) {
      for (const [k, v] of Object.entries(e.contributors)) {
        n += await insertMetric({
          metricType: `activity_contrib_${k}`,
          value: v,
          unit: "score",
          recordedAt: ts,
        });
      }
    }
  }
  return n;
}

async function syncDailyReadiness(start: string, end: string) {
  const data = await ouraFetchAll<{
    day: string;
    timestamp?: string;
    score: number | null;
    temperature_deviation: number | null;
    temperature_trend_deviation: number | null;
    contributors?: Record<string, number>;
  }>("daily_readiness", dateRange(start, end));
  let n = 0;
  for (const e of data) {
    const ts = parseTs(e.timestamp) ?? parseTs(e.day);
    n += await insertMetric({
      metricType: "readiness_score",
      value: e.score,
      unit: "score",
      recordedAt: ts,
      metadata: { contributors: e.contributors },
    });
    n += await insertMetric({
      metricType: "temperature_deviation",
      value: e.temperature_deviation,
      unit: "C",
      recordedAt: ts,
    });
    n += await insertMetric({
      metricType: "temperature_trend_deviation",
      value: e.temperature_trend_deviation,
      unit: "C",
      recordedAt: ts,
    });
    if (e.contributors) {
      for (const [k, v] of Object.entries(e.contributors)) {
        n += await insertMetric({
          metricType: `readiness_contrib_${k}`,
          value: v,
          unit: "score",
          recordedAt: ts,
        });
      }
    }
  }
  return n;
}

async function syncDailySpo2(start: string, end: string) {
  const data = await ouraFetchAll<{
    day: string;
    spo2_percentage?: { average: number | null } | null;
    breathing_disturbance_index?: number | null;
  }>("daily_spo2", dateRange(start, end));
  let n = 0;
  for (const e of data) {
    const ts = parseTs(e.day);
    n += await insertMetric({
      metricType: "spo2_avg",
      value: e.spo2_percentage?.average ?? null,
      unit: "%",
      recordedAt: ts,
      metadata: { spo2_percentage: e.spo2_percentage },
    });
    n += await insertMetric({
      metricType: "breathing_disturbance_index",
      value: e.breathing_disturbance_index,
      unit: "index",
      recordedAt: ts,
    });
  }
  return n;
}

async function syncDailyStress(start: string, end: string) {
  const data = await ouraFetchAll<{
    day: string;
    stress_high: number | null;
    recovery_high: number | null;
    day_summary: string | null;
  }>("daily_stress", dateRange(start, end));
  let n = 0;
  for (const e of data) {
    const ts = parseTs(e.day);
    n += await insertMetric({
      metricType: "stress_high",
      value: e.stress_high,
      unit: "s",
      recordedAt: ts,
      metadata: { day_summary: e.day_summary },
    });
    n += await insertMetric({
      metricType: "recovery_high",
      value: e.recovery_high,
      unit: "s",
      recordedAt: ts,
    });
  }
  return n;
}

async function syncDailyResilience(start: string, end: string) {
  const data = await ouraFetchAll<{
    day: string;
    level: string | null;
    contributors?: Record<string, number>;
  }>("daily_resilience", dateRange(start, end));
  let n = 0;
  for (const e of data) {
    const ts = parseTs(e.day);
    const level = e.level ? RESILIENCE_LEVEL_MAP[e.level.toLowerCase()] ?? null : null;
    n += await insertMetric({
      metricType: "resilience_level",
      value: level,
      unit: "level",
      recordedAt: ts,
      metadata: { level: e.level, contributors: e.contributors },
    });
    if (e.contributors) {
      for (const [k, v] of Object.entries(e.contributors)) {
        n += await insertMetric({
          metricType: `resilience_contrib_${k}`,
          value: v,
          unit: "score",
          recordedAt: ts,
        });
      }
    }
  }
  return n;
}

async function syncDailyCardiovascularAge(start: string, end: string) {
  const data = await ouraFetchAll<{ day: string; vascular_age: number | null }>(
    "daily_cardiovascular_age",
    dateRange(start, end),
  );
  let n = 0;
  for (const e of data) {
    n += await insertMetric({
      metricType: "cardiovascular_age",
      value: e.vascular_age,
      unit: "years",
      recordedAt: parseTs(e.day),
    });
  }
  return n;
}

async function syncVo2Max(start: string, end: string) {
  const data = await ouraFetchAll<{ day: string; timestamp?: string; vo2_max: number | null }>(
    "vO2_max",
    dateRange(start, end),
  );
  let n = 0;
  for (const e of data) {
    n += await insertMetric({
      metricType: "vo2_max",
      value: e.vo2_max,
      unit: "ml/kg/min",
      recordedAt: parseTs(e.timestamp) ?? parseTs(e.day),
    });
  }
  return n;
}

async function syncSleepSessions(start: string, end: string) {
  const data = await ouraFetchAll<{
    id: string;
    day: string;
    bedtime_start: string | null;
    bedtime_end: string | null;
    type: string | null;
    period: number | null;
    total_sleep_duration: number | null;
    deep_sleep_duration: number | null;
    rem_sleep_duration: number | null;
    light_sleep_duration: number | null;
    awake_time: number | null;
    efficiency: number | null;
    latency: number | null;
    average_heart_rate: number | null;
    lowest_heart_rate: number | null;
    average_hrv: number | null;
    average_breath: number | null;
    temperature_deviation: number | null;
    temperature_delta: number | null;
    heart_rate?: { items: (number | null)[]; interval: number; timestamp: string } | null;
    hrv?: { items: (number | null)[]; interval: number; timestamp: string } | null;
    sleep_phase_5_min?: string | null;
    readiness?: unknown;
  }>("sleep", dateRange(start, end));
  let n = 0;
  for (const e of data) {
    const ts = parseTs(e.bedtime_start) ?? parseTs(e.day);
    if (!ts) continue;
    const baseMeta = {
      session_id: e.id,
      type: e.type,
      period: e.period,
      bedtime_start: e.bedtime_start,
      bedtime_end: e.bedtime_end,
      sleep_phase_5_min: e.sleep_phase_5_min,
      heart_rate: e.heart_rate,
      hrv: e.hrv,
    };
    const fields: Array<[string, number | null, string]> = [
      ["sleep_total_duration", e.total_sleep_duration, "s"],
      ["sleep_deep_duration", e.deep_sleep_duration, "s"],
      ["sleep_rem_duration", e.rem_sleep_duration, "s"],
      ["sleep_light_duration", e.light_sleep_duration, "s"],
      ["sleep_awake_time", e.awake_time, "s"],
      ["sleep_efficiency", e.efficiency, "%"],
      ["sleep_latency", e.latency, "s"],
      ["sleep_hr_avg", e.average_heart_rate, "bpm"],
      ["sleep_hr_lowest", e.lowest_heart_rate, "bpm"],
      ["sleep_hrv_avg", e.average_hrv, "ms"],
      ["sleep_breath_avg", e.average_breath, "breaths/min"],
      ["sleep_temperature_deviation", e.temperature_deviation, "C"],
      ["sleep_temperature_delta", e.temperature_delta, "C"],
    ];
    for (const [type, value, unit] of fields) {
      const metadata = type === "sleep_total_duration" ? baseMeta : undefined;
      n += await insertMetric({ metricType: type, value, unit, recordedAt: ts, metadata });
    }
  }
  return n;
}

async function syncSleepTime(start: string, end: string) {
  const data = await ouraFetchAll<{
    day: string;
    optimal_bedtime?: { start_offset: number; end_offset: number; day_tz: number } | null;
    recommendation: string | null;
    status: string | null;
  }>("sleep_time", dateRange(start, end));
  let n = 0;
  for (const e of data) {
    const ts = parseTs(e.day);
    const offsetSeconds = e.optimal_bedtime?.start_offset ?? null;
    n += await insertMetric({
      metricType: "sleep_time_recommendation",
      value: offsetSeconds,
      unit: "s",
      recordedAt: ts,
      metadata: {
        optimal_bedtime: e.optimal_bedtime,
        recommendation: e.recommendation,
        status: e.status,
      },
    });
  }
  return n;
}

async function syncHeartRate(start: string, end: string) {
  const data = await ouraFetchAll<{
    bpm: number | null;
    source: string | null;
    timestamp: string;
  }>("heartrate", datetimeRange(start, end));
  if (data.length === 0) return 0;
  // Bulk insert in chunks to keep insert size bounded.
  const CHUNK = 500;
  let n = 0;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    const rows = slice
      .map((e) => {
        const ts = parseTs(e.timestamp);
        if (e.bpm == null || !ts) return null;
        return {
          source: "aura",
          metricType: "heart_rate",
          value: String(e.bpm),
          unit: "bpm",
          recordedAt: ts,
          metadata: { hr_source: e.source } as never,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length === 0) continue;
    const inserted = await db
      .insert(healthMetrics)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: healthMetrics.id });
    n += inserted.length;
  }
  return n;
}

async function syncWorkouts(start: string, end: string) {
  const data = await ouraFetchAll<{
    id: string;
    activity: string;
    calories: number | null;
    day: string;
    distance: number | null;
    end_datetime: string;
    intensity: string | null;
    label: string | null;
    source: string | null;
    start_datetime: string;
  }>("workout", dateRange(start, end));
  let n = 0;
  for (const e of data) {
    const startedAt = parseTs(e.start_datetime);
    const endedAt = parseTs(e.end_datetime);
    if (!startedAt || !endedAt) continue;
    const durationSec = (endedAt.getTime() - startedAt.getTime()) / 1000;
    const inserted = await db
      .insert(workouts)
      .values({
        externalId: `oura_workout_${e.id}`,
        name: e.activity || "workout",
        source: "aura",
        startedAt,
        endedAt,
        duration: String(durationSec),
        distance: e.distance != null ? String(e.distance) : null,
        distanceUnit: e.distance != null ? "m" : null,
        activeEnergy: e.calories != null ? String(e.calories) : null,
        activeEnergyUnit: e.calories != null ? "kcal" : null,
        avgHeartRate: null,
        maxHeartRate: null,
        location: null,
        isIndoor: null,
        metadata: {
          oura_kind: "workout",
          intensity: e.intensity,
          label: e.label,
          source: e.source,
          day: e.day,
        } as never,
        route: null,
      })
      .onConflictDoNothing()
      .returning({ id: workouts.id });
    if (inserted.length) n++;
  }
  return n;
}

async function syncSessions(start: string, end: string) {
  const data = await ouraFetchAll<{
    id: string;
    day: string;
    start_datetime: string;
    end_datetime: string;
    type: string | null;
    mood: string | null;
    heart_rate?: { items: (number | null)[]; interval: number; timestamp: string } | null;
    heart_rate_variability?: { items: (number | null)[]; interval: number; timestamp: string } | null;
    motion_count?: { items: (number | null)[]; interval: number; timestamp: string } | null;
  }>("session", dateRange(start, end));
  let n = 0;
  for (const e of data) {
    const startedAt = parseTs(e.start_datetime);
    const endedAt = parseTs(e.end_datetime);
    if (!startedAt || !endedAt) continue;
    const durationSec = (endedAt.getTime() - startedAt.getTime()) / 1000;
    const hrItems = e.heart_rate?.items?.filter((v): v is number => typeof v === "number") ?? [];
    const avgHr = hrItems.length ? hrItems.reduce((a, b) => a + b, 0) / hrItems.length : null;
    const maxHr = hrItems.length ? Math.max(...hrItems) : null;
    const inserted = await db
      .insert(workouts)
      .values({
        externalId: `oura_session_${e.id}`,
        name: e.type || "session",
        source: "aura",
        startedAt,
        endedAt,
        duration: String(durationSec),
        distance: null,
        distanceUnit: null,
        activeEnergy: null,
        activeEnergyUnit: null,
        avgHeartRate: avgHr != null ? String(avgHr) : null,
        maxHeartRate: maxHr != null ? String(maxHr) : null,
        location: null,
        isIndoor: null,
        metadata: {
          oura_kind: "session",
          mood: e.mood,
          day: e.day,
          heart_rate: e.heart_rate,
          heart_rate_variability: e.heart_rate_variability,
          motion_count: e.motion_count,
        } as never,
        route: null,
      })
      .onConflictDoNothing()
      .returning({ id: workouts.id });
    if (inserted.length) n++;
  }
  return n;
}

async function syncEnhancedTags(start: string, end: string) {
  const data = await ouraFetchAll<{
    id: string;
    tag_type_code: string | null;
    start_time: string;
    end_time: string | null;
    start_day: string;
    end_day: string | null;
    comment: string | null;
    custom_name: string | null;
  }>("enhanced_tag", dateRange(start, end));
  let n = 0;
  for (const e of data) {
    const ts = parseTs(e.start_time) ?? parseTs(e.start_day);
    n += await insertMetric({
      metricType: "tag",
      value: 1,
      unit: "event",
      recordedAt: ts,
      metadata: {
        id: e.id,
        tag_type_code: e.tag_type_code,
        start_time: e.start_time,
        end_time: e.end_time,
        start_day: e.start_day,
        end_day: e.end_day,
        comment: e.comment,
        custom_name: e.custom_name,
      },
    });
  }
  return n;
}

async function syncRestModePeriods(start: string, end: string) {
  const data = await ouraFetchAll<{
    id: string | number;
    start_day: string | null;
    end_day: string | null;
    episodes?: unknown;
  }>("rest_mode_period", dateRange(start, end));
  let n = 0;
  for (const e of data) {
    const ts = parseTs(e.start_day);
    if (!ts) continue;
    const startD = e.start_day ? new Date(e.start_day) : null;
    const endD = e.end_day ? new Date(e.end_day) : null;
    const days =
      startD && endD ? Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 86_400_000) + 1) : 1;
    n += await insertMetric({
      metricType: "rest_mode",
      value: days,
      unit: "days",
      recordedAt: ts,
      metadata: {
        id: e.id,
        start_day: e.start_day,
        end_day: e.end_day,
        episodes: e.episodes,
      },
    });
  }
  return n;
}

async function syncRingConfiguration() {
  const data = await ouraFetchAll<{
    id: string;
    color: string | null;
    design: string | null;
    firmware_version: string | null;
    hardware_type: string | null;
    set_up_at: string | null;
    size: number | null;
  }>("ring_configuration", {});
  let n = 0;
  for (const e of data) {
    const ts = parseTs(e.set_up_at) ?? new Date();
    n += await insertMetric({
      metricType: "ring_configuration",
      value: e.size ?? 1,
      unit: "ring_size",
      recordedAt: ts,
      metadata: {
        id: e.id,
        color: e.color,
        design: e.design,
        firmware_version: e.firmware_version,
        hardware_type: e.hardware_type,
        set_up_at: e.set_up_at,
      },
    });
  }
  return n;
}

async function syncPersonalInfo() {
  const info = (await ouraFetchRaw("personal_info", {})) as {
    age: number | null;
    weight: number | null;
    height: number | null;
    biological_sex: string | null;
    email: string | null;
  } | null;
  if (!info) return 0;
  // Snapshot daily — recorded_at = today's UTC midnight so resync within a day dedupes.
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return insertMetric({
    metricType: "personal_info",
    value: info.age,
    unit: "years",
    recordedAt: todayUtc,
    metadata: info,
  });
}

// ----- Connector ----------------------------------------------------------

type Handler = () => Promise<number>;

export const auraConnector: Connector = {
  name: "aura",
  schedule: "0 */6 * * *",

  async sync(options?: SyncOptions): Promise<SyncResult> {
    const endDate = options?.endDate ?? new Date().toISOString().slice(0, 10);
    const startDate =
      options?.startDate ??
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const handlers: Array<[string, Handler]> = [
      ["daily_sleep", () => syncDailySleep(startDate, endDate)],
      ["daily_activity", () => syncDailyActivity(startDate, endDate)],
      ["daily_readiness", () => syncDailyReadiness(startDate, endDate)],
      ["daily_spo2", () => syncDailySpo2(startDate, endDate)],
      ["daily_stress", () => syncDailyStress(startDate, endDate)],
      ["daily_resilience", () => syncDailyResilience(startDate, endDate)],
      ["daily_cardiovascular_age", () => syncDailyCardiovascularAge(startDate, endDate)],
      ["vO2_max", () => syncVo2Max(startDate, endDate)],
      ["sleep", () => syncSleepSessions(startDate, endDate)],
      ["sleep_time", () => syncSleepTime(startDate, endDate)],
      ["heartrate", () => syncHeartRate(startDate, endDate)],
      ["workout", () => syncWorkouts(startDate, endDate)],
      ["session", () => syncSessions(startDate, endDate)],
      ["enhanced_tag", () => syncEnhancedTags(startDate, endDate)],
      ["rest_mode_period", () => syncRestModePeriods(startDate, endDate)],
      ["ring_configuration", () => syncRingConfiguration()],
      ["personal_info", () => syncPersonalInfo()],
    ];

    let recordsSynced = 0;
    const errors: string[] = [];
    for (const [name, handler] of handlers) {
      try {
        recordsSynced += await handler();
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return errors.length ? { recordsSynced, errors } : { recordsSynced };
  },
};
