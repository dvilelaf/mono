import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Health API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe("POST /api/health/metrics", () => {
    it("creates a health metric", async () => {
      const res = await request(app)
        .post("/api/health/metrics")
        .set(AUTH)
        .send({
          source: "manual",
          metricType: "heart_rate",
          value: 72,
          unit: "bpm",
          recordedAt: "2026-04-06T10:00:00Z",
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.value).toBe("72");
    });
  });

  describe("GET /api/health/metrics", () => {
    it("returns metrics filtered by type", async () => {
      await request(app).post("/api/health/metrics").set(AUTH).send({
        source: "manual",
        metricType: "heart_rate",
        value: 72,
        unit: "bpm",
        recordedAt: "2026-04-06T10:00:00Z",
      });
      await request(app).post("/api/health/metrics").set(AUTH).send({
        source: "manual",
        metricType: "steps",
        value: 5000,
        unit: "count",
        recordedAt: "2026-04-06T10:00:00Z",
      });

      const res = await request(app)
        .get("/api/health/metrics?type=heart_rate")
        .set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].metricType).toBe("heart_rate");
    });
  });

  describe("GET /api/health/metrics/latest", () => {
    it("returns the most recent metric of a type", async () => {
      await request(app).post("/api/health/metrics").set(AUTH).send({
        source: "manual",
        metricType: "heart_rate",
        value: 70,
        unit: "bpm",
        recordedAt: "2026-04-06T09:00:00Z",
      });
      await request(app).post("/api/health/metrics").set(AUTH).send({
        source: "manual",
        metricType: "heart_rate",
        value: 75,
        unit: "bpm",
        recordedAt: "2026-04-06T11:00:00Z",
      });

      const res = await request(app)
        .get("/api/health/metrics/latest?type=heart_rate")
        .set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body.value).toBe("75");
    });
  });

  describe("POST /api/health/supplements", () => {
    it("creates a supplement entry", async () => {
      const res = await request(app)
        .post("/api/health/supplements")
        .set(AUTH)
        .send({
          name: "Vitamin D",
          dosage: "5000",
          unit: "IU",
          takenAt: "2026-04-06T08:00:00Z",
          source: "manual",
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Vitamin D");
    });
  });

  describe("GET /api/health/supplements", () => {
    it("returns supplements in date range", async () => {
      await request(app).post("/api/health/supplements").set(AUTH).send({
        name: "Vitamin D",
        dosage: "5000",
        unit: "IU",
        takenAt: "2026-04-06T08:00:00Z",
        source: "manual",
      });

      const res = await request(app)
        .get("/api/health/supplements?from=2026-04-06&to=2026-04-07")
        .set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("GET /api/health/nutrition", () => {
    it("returns nutrition entries", async () => {
      const res = await request(app).get("/api/health/nutrition").set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
