import { describe, it, expect, vi, beforeEach } from "vitest";
import { auraConnector } from "../../src/connectors/aura.connector.js";
import { resetDb } from "../helpers/setup.js";
import { db } from "../../src/db/index.js";
import { healthMetrics } from "../../src/domains/health/health.schema.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Aura (Oura) Connector", () => {
  beforeEach(async () => {
    await resetDb();
    mockFetch.mockReset();
    process.env.OURA_ACCESS_TOKEN = "mock-token";
  });

  it("fetches sleep data and stores as health metrics", async () => {
    // Mock daily_sleep response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{
          day: "2026-04-05", score: 85,
          contributors: { deep_sleep: 80, rem_sleep: 75 },
        }],
      }),
    });
    // Mock daily_activity response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const result = await auraConnector.sync();
    expect(result.recordsSynced).toBe(1);

    const rows = await db.select().from(healthMetrics);
    expect(rows.some((r) => r.metricType === "sleep_score")).toBe(true);
  });

  it("handles API errors gracefully", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" });
    await expect(auraConnector.sync()).rejects.toThrow("Oura API error: 401");
  });
});
