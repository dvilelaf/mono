import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Documents API", () => {
  beforeEach(async () => { await resetDb(); });

  it("POST /api/documents creates a document", async () => {
    const res = await request(app).post("/api/documents").set(AUTH).send({
      domain: "email", title: "Meeting notes",
      content: "Discussed the roadmap for Q2",
      metadata: { from: "alice@example.com", tags: ["meeting"] },
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.domain).toBe("email");
  });

  it("GET /api/documents filters by domain", async () => {
    await request(app).post("/api/documents").set(AUTH).send({ domain: "email", title: "Email 1", content: "Content 1" });
    await request(app).post("/api/documents").set(AUTH).send({ domain: "notes", title: "Note 1", content: "Content 2" });
    const res = await request(app).get("/api/documents?domain=email").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].domain).toBe("email");
  });

  it("GET /api/documents/:id returns a single document", async () => {
    const created = await request(app).post("/api/documents").set(AUTH).send({
      domain: "notes", title: "Test", content: "Body",
    });
    const res = await request(app).get(`/api/documents/${created.body.id}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Test");
  });
});
