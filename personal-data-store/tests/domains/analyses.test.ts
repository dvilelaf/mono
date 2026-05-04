import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Analyses API", () => {
  beforeEach(async () => { await resetDb(); });

  it("POST /api/analyses creates an analysis with source", async () => {
    const res = await request(app).post("/api/analyses").set(AUTH).send({
      domain: "finance",
      analysisType: "yield_optimisation",
      title: "Yield optimisation 2026-Q2",
      summary: "Recommend moving to Lido",
      source: "claude",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.source).toBe("claude");
    expect(res.body.domain).toBe("finance");
  });

  it("POST /api/analyses without source still works (nullable)", async () => {
    const res = await request(app).post("/api/analyses").set(AUTH).send({
      domain: "health",
      analysisType: "apob_trend",
      title: "ApoB trend",
    });
    expect(res.status).toBe(201);
    expect(res.body.source).toBeNull();
  });

  it("GET /api/analyses?domain=health returns matching rows", async () => {
    await request(app).post("/api/analyses").set(AUTH).send({
      domain: "health", analysisType: "apob_trend", title: "ApoB trend", source: "claude",
    });
    await request(app).post("/api/analyses").set(AUTH).send({
      domain: "finance", analysisType: "spending", title: "Spending", source: "claude",
    });
    const res = await request(app).get("/api/analyses?domain=health").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].domain).toBe("health");
  });

  it("GET /api/analyses with multiple filters applies all", async () => {
    await request(app).post("/api/analyses").set(AUTH).send({
      domain: "health", analysisType: "apob_trend", title: "A",
    });
    await request(app).post("/api/analyses").set(AUTH).send({
      domain: "health", analysisType: "sleep", title: "B",
    });
    const res = await request(app).get("/api/analyses?domain=health&type=sleep").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("B");
  });
});
