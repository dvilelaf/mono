import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Business API", () => {
  beforeEach(async () => { await resetDb(); });

  it("creates a client", async () => {
    const res = await request(app).post("/api/business/clients").set(AUTH).send({
      name: "Acme Corp", contactInfo: { email: "acme@example.com" }, status: "active",
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Acme Corp");
  });

  it("creates a project linked to a client", async () => {
    const client = await request(app).post("/api/business/clients").set(AUTH).send({ name: "Acme Corp", status: "active" });
    const res = await request(app).post("/api/business/projects").set(AUTH).send({
      clientId: client.body.id, name: "Widget Redesign", status: "active",
      rate: { amount: 150, currency: "USD", type: "hourly" },
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Widget Redesign");
  });

  it("creates a time entry", async () => {
    const client = await request(app).post("/api/business/clients").set(AUTH).send({ name: "Acme Corp", status: "active" });
    const project = await request(app).post("/api/business/projects").set(AUTH).send({
      clientId: client.body.id, name: "Widget Redesign", status: "active",
    });
    const res = await request(app).post("/api/business/time").set(AUTH).send({
      projectId: project.body.id, description: "Architecture review", hours: 2.5, workedAt: "2026-04-06",
    });
    expect(res.status).toBe(201);
    expect(res.body.hours).toBe("2.5");
  });

  it("creates an invoice", async () => {
    const client = await request(app).post("/api/business/clients").set(AUTH).send({ name: "Acme Corp", status: "active" });
    const res = await request(app).post("/api/business/invoices").set(AUTH).send({
      clientId: client.body.id, amount: 3750, currency: "USD", status: "draft", issuedAt: "2026-04-06",
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
  });

  it("creates an expense", async () => {
    const res = await request(app).post("/api/business/expenses").set(AUTH).send({
      category: "software", description: "GitHub subscription", amount: 44, currency: "USD",
      incurredAt: "2026-04-01", taxDeductible: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.taxDeductible).toBe(true);
  });

  it("queries clients by status", async () => {
    await request(app).post("/api/business/clients").set(AUTH).send({ name: "Active Co", status: "active" });
    await request(app).post("/api/business/clients").set(AUTH).send({ name: "Old Co", status: "inactive" });
    const res = await request(app).get("/api/business/clients?status=active").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Active Co");
  });

  it("queries time entries by project and date range", async () => {
    const client = await request(app).post("/api/business/clients").set(AUTH).send({ name: "Acme", status: "active" });
    const project = await request(app).post("/api/business/projects").set(AUTH).send({
      clientId: client.body.id, name: "P1", status: "active",
    });
    await request(app).post("/api/business/time").set(AUTH).send({
      projectId: project.body.id, description: "Work", hours: 3, workedAt: "2026-04-06",
    });
    const res = await request(app).get(`/api/business/time?project_id=${project.body.id}&from=2026-04-01&to=2026-04-30`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
