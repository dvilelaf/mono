import { describe, it, expect, vi, beforeEach } from "vitest";
import { auraConnector } from "../../src/connectors/aura.connector.js";
import { resetDb } from "../helpers/setup.js";
import { db } from "../../src/db/index.js";
import { healthMetrics, workouts } from "../../src/domains/health/health.schema.js";
import { eq, and } from "drizzle-orm";

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

type MockResponses = Record<string, unknown>;

function jsonOk(body: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

function setupResponses(responses: MockResponses) {
  // Match by endpoint name in the URL path. Default = empty data.
  mockFetch.mockImplementation(async (input: string) => {
    const url = new URL(input);
    const m = url.pathname.match(/\/v2\/usercollection\/([^/?]+)/);
    const endpoint = m ? m[1] : "";
    if (endpoint in responses) return jsonOk(responses[endpoint]);
    // personal_info returns a single object, others return { data, next_token }
    if (endpoint === "personal_info") return jsonOk({});
    return jsonOk({ data: [], next_token: null });
  });
}

describe("Aura (Oura) Connector", () => {
  beforeEach(async () => {
    await resetDb();
    mockFetch.mockReset();
    process.env.OURA_ACCESS_TOKEN = "mock-token";
  });

  it("fetches sleep score and contributors", async () => {
    setupResponses({
      daily_sleep: {
        data: [
          {
            day: "2026-04-05",
            timestamp: "2026-04-05T00:00:00+00:00",
            score: 85,
            contributors: { deep_sleep: 80, rem_sleep: 75, efficiency: 90 },
          },
        ],
      },
    });

    const result = await auraConnector.sync();
    expect(result.recordsSynced).toBeGreaterThan(0);

    const rows = await db.select().from(healthMetrics);
    expect(rows.find((r) => r.metricType === "sleep_score")?.value).toBe("85");
    expect(rows.find((r) => r.metricType === "sleep_contrib_deep_sleep")?.value).toBe("80");
    expect(rows.find((r) => r.metricType === "sleep_contrib_efficiency")?.value).toBe("90");
  });

  it("fetches readiness, temperature deviation, and contributors", async () => {
    setupResponses({
      daily_readiness: {
        data: [
          {
            day: "2026-04-05",
            score: 78,
            temperature_deviation: 0.12,
            temperature_trend_deviation: 0.05,
            contributors: { hrv_balance: 70, body_temperature: 80 },
          },
        ],
      },
    });

    await auraConnector.sync();

    const rows = await db.select().from(healthMetrics);
    expect(rows.find((r) => r.metricType === "readiness_score")?.value).toBe("78");
    expect(rows.find((r) => r.metricType === "temperature_deviation")?.value).toBe("0.12");
    expect(rows.find((r) => r.metricType === "temperature_trend_deviation")?.value).toBe("0.05");
    expect(rows.find((r) => r.metricType === "readiness_contrib_hrv_balance")?.value).toBe("70");
  });

  it("fetches activity with full breakdown", async () => {
    setupResponses({
      daily_activity: {
        data: [
          {
            day: "2026-04-05",
            score: 88,
            steps: 9500,
            active_calories: 420,
            total_calories: 2400,
            equivalent_walking_distance: 7500,
            high_activity_time: 1800,
            medium_activity_time: 3600,
            low_activity_time: 7200,
            sedentary_time: 18000,
            resting_time: 25000,
            non_wear_time: 0,
            target_calories: 500,
            target_meters: 8000,
            meters_to_target: 0,
            inactivity_alerts: 1,
            average_met_minutes: 1.4,
            contributors: { meet_daily_targets: 90 },
          },
        ],
      },
    });

    await auraConnector.sync();
    const rows = await db.select().from(healthMetrics);
    const types = rows.map((r) => r.metricType);
    for (const t of [
      "activity_score",
      "steps",
      "active_calories",
      "total_calories",
      "equivalent_walking_distance",
      "high_activity_time",
      "sedentary_time",
      "non_wear_time",
      "inactivity_alerts",
      "average_met_minutes",
      "activity_contrib_meet_daily_targets",
    ]) {
      expect(types).toContain(t);
    }
  });

  it("fetches spo2, stress, resilience, cardiovascular age, vo2 max", async () => {
    setupResponses({
      daily_spo2: {
        data: [
          { day: "2026-04-05", spo2_percentage: { average: 97.5 }, breathing_disturbance_index: 4 },
        ],
      },
      daily_stress: {
        data: [{ day: "2026-04-05", stress_high: 1200, recovery_high: 14400, day_summary: "balanced" }],
      },
      daily_resilience: {
        data: [{ day: "2026-04-05", level: "strong", contributors: { sleep_recovery: 80 } }],
      },
      daily_cardiovascular_age: {
        data: [{ day: "2026-04-05", vascular_age: 41 }],
      },
      vO2_max: {
        data: [{ day: "2026-04-05", timestamp: "2026-04-05T08:00:00+00:00", vo2_max: 47.3 }],
      },
    });

    await auraConnector.sync();
    const rows = await db.select().from(healthMetrics);
    const byType = (t: string) => rows.find((r) => r.metricType === t);

    expect(byType("spo2_avg")?.value).toBe("97.5");
    expect(byType("breathing_disturbance_index")?.value).toBe("4");
    expect(byType("stress_high")?.value).toBe("1200");
    expect(byType("recovery_high")?.value).toBe("14400");
    expect(byType("resilience_level")?.value).toBe("4"); // "strong" => 4
    expect(byType("resilience_contrib_sleep_recovery")?.value).toBe("80");
    expect(byType("cardiovascular_age")?.value).toBe("41");
    expect(byType("vo2_max")?.value).toBe("47.3");
  });

  it("fetches sleep sessions with stage durations and HR/HRV detail", async () => {
    setupResponses({
      sleep: {
        data: [
          {
            id: "sess-1",
            day: "2026-04-05",
            bedtime_start: "2026-04-04T23:00:00+00:00",
            bedtime_end: "2026-04-05T07:00:00+00:00",
            type: "long_sleep",
            period: 1,
            total_sleep_duration: 27000,
            deep_sleep_duration: 4800,
            rem_sleep_duration: 6000,
            light_sleep_duration: 16200,
            awake_time: 600,
            efficiency: 92,
            latency: 720,
            average_heart_rate: 56,
            lowest_heart_rate: 48,
            average_hrv: 65,
            average_breath: 13.5,
            temperature_deviation: 0.1,
            temperature_delta: 0.05,
            heart_rate: { items: [55, 56, 57], interval: 300, timestamp: "2026-04-04T23:00:00+00:00" },
            hrv: { items: [60, 65, 70], interval: 300, timestamp: "2026-04-04T23:00:00+00:00" },
            sleep_phase_5_min: "12343...",
          },
        ],
      },
    });

    await auraConnector.sync();
    const rows = await db.select().from(healthMetrics);
    const byType = (t: string) => rows.find((r) => r.metricType === t);

    expect(byType("sleep_total_duration")?.value).toBe("27000");
    expect(byType("sleep_deep_duration")?.value).toBe("4800");
    expect(byType("sleep_rem_duration")?.value).toBe("6000");
    expect(byType("sleep_efficiency")?.value).toBe("92");
    expect(byType("sleep_hr_avg")?.value).toBe("56");
    expect(byType("sleep_hrv_avg")?.value).toBe("65");
    expect(byType("sleep_temperature_deviation")?.value).toBe("0.1");

    const totalRow = byType("sleep_total_duration");
    const meta = totalRow?.metadata as { session_id: string; heart_rate: { items: number[] } } | null;
    expect(meta?.session_id).toBe("sess-1");
    expect(meta?.heart_rate?.items).toEqual([55, 56, 57]);
  });

  it("fetches heart rate samples in bulk", async () => {
    const samples = Array.from({ length: 750 }, (_, i) => ({
      bpm: 60 + (i % 20),
      source: "rest",
      timestamp: new Date(Date.UTC(2026, 3, 5, 0, i)).toISOString(),
    }));
    setupResponses({
      heartrate: { data: samples, next_token: null },
    });

    const result = await auraConnector.sync();
    expect(result.recordsSynced).toBe(750);

    const rows = await db
      .select()
      .from(healthMetrics)
      .where(and(eq(healthMetrics.metricType, "heart_rate"), eq(healthMetrics.source, "aura")));
    expect(rows).toHaveLength(750);
  });

  it("paginates next_token responses", async () => {
    let calls = 0;
    mockFetch.mockImplementation(async (input: string) => {
      const url = new URL(input);
      const m = url.pathname.match(/\/v2\/usercollection\/([^/?]+)/);
      const endpoint = m ? m[1] : "";
      if (endpoint === "daily_sleep") {
        calls++;
        if (calls === 1) {
          return jsonOk({
            data: [{ day: "2026-04-04", score: 80, contributors: {} }],
            next_token: "page2",
          });
        }
        return jsonOk({
          data: [{ day: "2026-04-05", score: 82, contributors: {} }],
          next_token: null,
        });
      }
      if (endpoint === "personal_info") return jsonOk({});
      return jsonOk({ data: [], next_token: null });
    });

    await auraConnector.sync();
    expect(calls).toBe(2);
    const rows = await db
      .select()
      .from(healthMetrics)
      .where(eq(healthMetrics.metricType, "sleep_score"));
    expect(rows).toHaveLength(2);
  });

  it("imports workouts and sessions into the workouts table", async () => {
    setupResponses({
      workout: {
        data: [
          {
            id: "w-1",
            activity: "running",
            calories: 320,
            day: "2026-04-05",
            distance: 5000,
            end_datetime: "2026-04-05T07:30:00+00:00",
            intensity: "moderate",
            label: null,
            source: "manual",
            start_datetime: "2026-04-05T07:00:00+00:00",
          },
        ],
      },
      session: {
        data: [
          {
            id: "s-1",
            day: "2026-04-05",
            start_datetime: "2026-04-05T20:00:00+00:00",
            end_datetime: "2026-04-05T20:15:00+00:00",
            type: "meditation",
            mood: "good",
            heart_rate: { items: [62, 60, 58], interval: 60, timestamp: "2026-04-05T20:00:00+00:00" },
            heart_rate_variability: null,
            motion_count: null,
          },
        ],
      },
    });

    await auraConnector.sync();
    const rows = await db.select().from(workouts).where(eq(workouts.source, "aura"));
    expect(rows).toHaveLength(2);
    const w = rows.find((r) => r.externalId === "oura_workout_w-1");
    expect(w?.name).toBe("running");
    expect(w?.distance).toBe("5000");
    expect(w?.activeEnergy).toBe("320");

    const s = rows.find((r) => r.externalId === "oura_session_s-1");
    expect(s?.name).toBe("meditation");
    expect(s?.avgHeartRate).toBe("60"); // (62+60+58)/3
    expect(s?.maxHeartRate).toBe("62");
  });

  it("imports tags, rest mode periods, ring configuration, and personal info", async () => {
    setupResponses({
      enhanced_tag: {
        data: [
          {
            id: "t-1",
            tag_type_code: "exercise",
            start_time: "2026-04-05T18:00:00+00:00",
            end_time: null,
            start_day: "2026-04-05",
            end_day: null,
            comment: "evening jog",
            custom_name: null,
          },
        ],
      },
      rest_mode_period: {
        data: [{ id: "r-1", start_day: "2026-04-03", end_day: "2026-04-05", episodes: [] }],
      },
      ring_configuration: {
        data: [
          {
            id: "ring-1",
            color: "stealth",
            design: "horizon",
            firmware_version: "1.2.3",
            hardware_type: "gen3",
            set_up_at: "2026-01-15T12:00:00+00:00",
            size: 10,
          },
        ],
      },
      personal_info: {
        age: 39,
        weight: 78.4,
        height: 1.83,
        biological_sex: "male",
        email: "user@example.com",
      },
    });

    await auraConnector.sync();
    const rows = await db.select().from(healthMetrics);
    expect(rows.find((r) => r.metricType === "tag")?.metadata).toMatchObject({
      tag_type_code: "exercise",
      comment: "evening jog",
    });
    expect(rows.find((r) => r.metricType === "rest_mode")?.value).toBe("3");
    expect(rows.find((r) => r.metricType === "ring_configuration")?.value).toBe("10");
    const pi = rows.find((r) => r.metricType === "personal_info");
    expect(pi?.value).toBe("39");
    expect(pi?.metadata).toMatchObject({ biological_sex: "male", height: 1.83 });
  });

  it("isolates errors per endpoint and reports them in errors", async () => {
    mockFetch.mockImplementation(async (input: string) => {
      const url = new URL(input);
      const m = url.pathname.match(/\/v2\/usercollection\/([^/?]+)/);
      const endpoint = m ? m[1] : "";
      if (endpoint === "daily_sleep") {
        return { ok: false, status: 500, statusText: "Server Error", json: async () => ({}) };
      }
      if (endpoint === "daily_activity") {
        return jsonOk({
          data: [{ day: "2026-04-05", score: 70, steps: 1000, active_calories: 100 }],
        });
      }
      if (endpoint === "personal_info") return jsonOk({});
      return jsonOk({ data: [], next_token: null });
    });

    const result = await auraConnector.sync();
    expect(result.recordsSynced).toBeGreaterThan(0);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => e.startsWith("daily_sleep:"))).toBe(true);
    // activity_score should still have been written despite sleep failing
    const rows = await db
      .select()
      .from(healthMetrics)
      .where(eq(healthMetrics.metricType, "activity_score"));
    expect(rows).toHaveLength(1);
  });

  it("throws when token is missing", async () => {
    delete process.env.OURA_ACCESS_TOKEN;
    setupResponses({});
    const result = await auraConnector.sync();
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.errors!.every((e) => e.includes("OURA_ACCESS_TOKEN"))).toBe(true);
  });
});
