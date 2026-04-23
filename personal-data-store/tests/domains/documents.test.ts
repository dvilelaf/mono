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

  it("POST /api/documents persists source and type", async () => {
    const res = await request(app).post("/api/documents").set(AUTH).send({
      domain: "finance",
      type: "preference",
      title: "MEXC withdrawal rule",
      content: "Always use USDT not TRX",
      source: "oak",
    });
    expect(res.status).toBe(201);
    expect(res.body.source).toBe("oak");
    expect(res.body.type).toBe("preference");
  });

  it("POST /api/documents without source still works (nullable)", async () => {
    const res = await request(app).post("/api/documents").set(AUTH).send({
      domain: "notes", title: "Plain", content: "no source",
    });
    expect(res.status).toBe(201);
    expect(res.body.source).toBeNull();
    expect(res.body.type).toBeNull();
  });

  it("GET /api/documents filters by type", async () => {
    await request(app).post("/api/documents").set(AUTH).send({
      domain: "finance", type: "preference", title: "Pref", content: "x",
    });
    await request(app).post("/api/documents").set(AUTH).send({
      domain: "finance", type: "position", title: "Pos", content: "y",
    });
    const res = await request(app).get("/api/documents?type=preference").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe("preference");
  });

  it("PATCH /api/documents/:id updates domain and type", async () => {
    const created = await request(app).post("/api/documents").set(AUTH).send({
      domain: "inbox", title: "Draft", content: "Some content", source: "claude",
    });
    const res = await request(app)
      .patch(`/api/documents/${created.body.id}`)
      .set(AUTH)
      .send({ domain: "finance", type: "preference" });
    expect(res.status).toBe(200);
    expect(res.body.domain).toBe("finance");
    expect(res.body.type).toBe("preference");
    expect(res.body.source).toBe("claude");
  });

  it("PATCH /api/documents/:id returns 404 for unknown id", async () => {
    const res = await request(app)
      .patch("/api/documents/00000000-0000-0000-0000-000000000000")
      .set(AUTH)
      .send({ domain: "finance" });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/documents/:id removes the document", async () => {
    const created = await request(app).post("/api/documents").set(AUTH).send({
      domain: "inbox", title: "To delete", content: "bye",
    });
    const del = await request(app).delete(`/api/documents/${created.body.id}`).set(AUTH);
    expect(del.status).toBe(204);
    const get = await request(app).get(`/api/documents/${created.body.id}`).set(AUTH);
    expect(get.status).toBe(404);
  });
});
