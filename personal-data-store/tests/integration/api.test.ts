import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Integration: Full API", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("health check works without auth", async () => {
    const res = await request(app).get("/api/system/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("rejects unauthenticated requests to protected routes", async () => {
    const res = await request(app).get("/api/health/metrics");
    expect(res.status).toBe(401);
  });

  it("end-to-end: create and query health data", async () => {
    await request(app).post("/api/health/metrics").set(AUTH).send({
      source: "manual",
      metricType: "heart_rate",
      value: 72,
      unit: "bpm",
      recordedAt: "2026-04-06T10:00:00Z",
    });

    const res = await request(app).get("/api/health/metrics?type=heart_rate").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("end-to-end: business workflow", async () => {
    const client = await request(app)
      .post("/api/business/clients").set(AUTH)
      .send({ name: "TestCo", status: "active" });

    const project = await request(app)
      .post("/api/business/projects").set(AUTH)
      .send({ clientId: client.body.id, name: "Project X", status: "active" });

    await request(app)
      .post("/api/business/time").set(AUTH)
      .send({ projectId: project.body.id, description: "Dev work", hours: 4, workedAt: "2026-04-06" });

    const invoice = await request(app)
      .post("/api/business/invoices").set(AUTH)
      .send({ clientId: client.body.id, amount: 600, currency: "USD", status: "draft", issuedAt: "2026-04-06" });

    expect(invoice.status).toBe(201);

    const time = await request(app)
      .get(`/api/business/time?project_id=${project.body.id}`).set(AUTH);
    expect(time.body).toHaveLength(1);
    expect(time.body[0].hours).toBe("4");
  });

  it("end-to-end: finance workflow", async () => {
    const wallet = await request(app)
      .post("/api/finance/wallets").set(AUTH)
      .send({ address: "0xdeadbeef", chain: "ethereum", label: "test" });
    expect(wallet.status).toBe(201);

    const account = await request(app)
      .post("/api/finance/accounts").set(AUTH)
      .send({ institution: "revolut", accountName: "checking", accountType: "checking", currency: "GBP" });
    expect(account.status).toBe(201);

    const walletList = await request(app).get("/api/finance/wallets").set(AUTH);
    expect(walletList.body).toHaveLength(1);

    const accountList = await request(app).get("/api/finance/accounts").set(AUTH);
    expect(accountList.body).toHaveLength(1);
  });

  it("end-to-end: documents and search", async () => {
    await request(app).post("/api/documents").set(AUTH).send({
      domain: "email",
      title: "Important email",
      content: "We need to discuss the quarterly budget review",
    });

    const docs = await request(app).get("/api/documents?domain=email").set(AUTH);
    expect(docs.body).toHaveLength(1);
    expect(docs.body[0].title).toBe("Important email");
  });

  it("system: lists connectors", async () => {
    const res = await request(app).get("/api/system/connectors").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some((c: { name: string }) => c.name === "aura")).toBe(true);
  });
});
