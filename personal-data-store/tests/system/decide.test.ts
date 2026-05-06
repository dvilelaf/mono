import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("POST /api/decide", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.PDS_DECIDE_DRY_RUN = "1";
  });
  afterEach(() => {
    delete process.env.PDS_DECIDE_DRY_RUN;
  });

  it("requires auth", async () => {
    const res = await request(app)
      .post("/api/decide")
      .send({ question: "anything" });
    expect(res.status).toBe(401);
  });

  it("rejects empty question", async () => {
    const res = await request(app).post("/api/decide").set(AUTH).send({});
    expect(res.status).toBe(400);
  });

  it("rejects non-string context", async () => {
    const res = await request(app)
      .post("/api/decide")
      .set(AUTH)
      .send({ question: "hi", context: 42 });
    expect(res.status).toBe(400);
  });

  it("returns prompt + sources in dry-run mode with no live data", async () => {
    const res = await request(app)
      .post("/api/decide")
      .set(AUTH)
      .send({ question: "Should I increase my berberine dose?" });
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(typeof res.body.answer).toBe("string");
    expect(res.body.answer).toContain("USER QUESTION");
    expect(res.body.answer).toContain("Should I increase my berberine dose?");
    expect(res.body.sources).toEqual({
      goals: 0,
      alerts: 0,
      interventions: 0,
      documents: 0,
      canonical: 0,
    });
    expect(Array.isArray(res.body.citations)).toBe(true);
    expect(Array.isArray(res.body.conflictingGoals)).toBe(true);
    expect(typeof res.body.promptChars).toBe("number");
  });

  it("includes goals and active interventions in the prompt and citations", async () => {
    const goalRes = await request(app)
      .post("/api/goals")
      .set(AUTH)
      .send({
        slug: "apob-under-70",
        title: "Keep ApoB under 70",
        domain: "health",
        metricSource: { kind: "metric", metricType: "cardiovascular_apob" },
        targetValue: 70,
        targetDirection: "below",
        unit: "mg/dL",
        canonicalTopics: ["health.cardiovascular"],
      });
    expect(goalRes.status).toBe(201);

    const intvRes = await request(app)
      .post("/api/interventions")
      .set(AUTH)
      .send({
        slug: "berberine-500",
        title: "Berberine 500mg",
        domain: "health",
        type: "supplement",
        status: "active",
        startDate: "2026-04-01",
        protocol: "500mg twice daily with meals",
      });
    expect(intvRes.status).toBeLessThan(400);

    const res = await request(app)
      .post("/api/decide")
      .set(AUTH)
      .send({ question: "Should I increase my berberine dose?" });
    expect(res.status).toBe(200);
    expect(res.body.sources.goals).toBe(1);
    expect(res.body.sources.interventions).toBe(1);
    expect(res.body.answer).toContain("apob-under-70");
    expect(res.body.answer).toContain("berberine-500");
    const kinds = (res.body.citations as Array<{ kind: string }>).map((c) => c.kind);
    expect(kinds).toContain("goal");
    expect(kinds).toContain("intervention");
  });

  it("passes additional context through to the prompt", async () => {
    const res = await request(app)
      .post("/api/decide")
      .set(AUTH)
      .send({
        question: "Should I rebalance USDC?",
        context: "Considering a move from Aave to Morpho.",
      });
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain("ADDITIONAL CONTEXT");
    expect(res.body.answer).toContain("Aave to Morpho");
  });
});
