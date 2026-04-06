import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";
import { db } from "../../src/db/index.js";
import { healthMetrics } from "../../src/domains/health/health.schema.js";

describe("Apple Health Webhook", () => {
  beforeEach(async () => { await resetDb(); });

  it("rejects requests without webhook secret", async () => {
    const res = await request(app)
      .post("/webhooks/apple-health")
      .send({ data: { metrics: [] } });
    expect(res.status).toBe(401);
  });

  it("accepts and stores Health Auto Export data", async () => {
    const payload = {
      data: {
        metrics: [
          {
            name: "heart_rate", units: "bpm",
            data: [
              { date: "2026-04-06T10:00:00Z", qty: 72 },
              { date: "2026-04-06T10:05:00Z", qty: 75 },
            ],
          },
          {
            name: "step_count", units: "count",
            data: [{ date: "2026-04-06T10:00:00Z", qty: 250 }],
          },
        ],
      },
    };

    const res = await request(app)
      .post("/webhooks/apple-health")
      .set("X-Webhook-Secret", process.env.WEBHOOK_SECRET || "")
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.recordsSynced).toBe(3);

    const rows = await db.select().from(healthMetrics);
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.metricType === "heart_rate")).toBe(true);
    expect(rows.some((r) => r.metricType === "step_count")).toBe(true);
  });
});
