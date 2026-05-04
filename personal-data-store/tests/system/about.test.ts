import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("GET /api/about", () => {
  beforeEach(async () => { await resetDb(); });

  it("returns the unified shape with all domain keys as arrays", async () => {
    const res = await request(app).get("/api/about?topic=health&limit=3").set(AUTH);
    expect(res.status).toBe(200);
    for (const key of ["documents", "health", "finance", "workouts", "genomics", "business", "analyses"]) {
      expect(res.body).toHaveProperty(key);
      expect(Array.isArray(res.body[key])).toBe(true);
    }
  });

  it("requires the topic parameter", async () => {
    const res = await request(app).get("/api/about").set(AUTH);
    expect(res.status).toBe(400);
  });

  it("clamps limit to 20", async () => {
    const res = await request(app).get("/api/about?topic=test&limit=999").set(AUTH);
    expect(res.status).toBe(200);
  });

  it("requires auth", async () => {
    const res = await request(app).get("/api/about?topic=health");
    expect(res.status).toBe(401);
  });

  it("matches health metrics by metric_type", async () => {
    await request(app).post("/api/health/metrics").set(AUTH).send({
      source: "manual",
      metricType: "cardiovascular_apob",
      value: 70,
      unit: "mg/dL",
      recordedAt: "2026-04-06T10:00:00Z",
    });
    const res = await request(app).get("/api/about?topic=cardiovascular&limit=5").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.health.length).toBeGreaterThan(0);
  });

  it("matches analyses by title", async () => {
    await request(app).post("/api/analyses").set(AUTH).send({
      domain: "finance",
      analysisType: "yield",
      title: "Yield optimisation review",
      summary: "Move stables to Lido",
      source: "claude",
    });
    const res = await request(app).get("/api/about?topic=yield&limit=5").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.analyses.length).toBeGreaterThan(0);
  });
});
