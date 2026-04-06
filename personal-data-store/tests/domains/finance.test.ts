import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Finance API", () => {
  beforeEach(async () => { await resetDb(); });

  describe("Wallets & Portfolio", () => {
    it("POST /api/finance/wallets creates a wallet", async () => {
      const res = await request(app).post("/api/finance/wallets").set(AUTH).send({
        address: "0xabc123", chain: "ethereum", label: "main",
      });
      expect(res.status).toBe(201);
      expect(res.body.address).toBe("0xabc123");
    });

    it("GET /api/finance/wallets lists wallets", async () => {
      await request(app).post("/api/finance/wallets").set(AUTH).send({
        address: "0xabc123", chain: "ethereum", label: "main",
      });
      const res = await request(app).get("/api/finance/wallets").set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it("GET /api/finance/portfolio returns latest snapshots", async () => {
      const res = await request(app).get("/api/finance/portfolio?latest=true").set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("Accounts & Transactions", () => {
    it("POST /api/finance/accounts creates an account", async () => {
      const res = await request(app).post("/api/finance/accounts").set(AUTH).send({
        institution: "revolut", accountName: "main checking", accountType: "checking", currency: "GBP",
      });
      expect(res.status).toBe(201);
      expect(res.body.institution).toBe("revolut");
    });

    it("GET /api/finance/transactions returns filtered transactions", async () => {
      const acct = await request(app).post("/api/finance/accounts").set(AUTH).send({
        institution: "revolut", accountName: "main", accountType: "checking", currency: "GBP",
      });
      const res = await request(app).get(`/api/finance/transactions?account_id=${acct.body.id}`).set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("GET /api/finance/balances returns balance history", async () => {
      const res = await request(app).get("/api/finance/balances").set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("GET /api/finance/holdings returns holdings", async () => {
      const res = await request(app).get("/api/finance/holdings").set(AUTH);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
