import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("System API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("GET /api/system/connectors returns connector list", async () => {
    const res = await request(app).get("/api/system/connectors").set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/system/connectors/:name/runs returns empty array initially", async () => {
    const res = await request(app).get("/api/system/connectors/aura/runs").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
