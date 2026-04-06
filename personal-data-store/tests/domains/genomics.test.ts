import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Genomics API", () => {
  beforeEach(async () => { await resetDb(); });

  describe("POST /api/genomics/import", () => {
    it("imports a genomics profile with variants", async () => {
      const res = await request(app).post("/api/genomics/import").set(AUTH).send({
        source: "23andme", profileType: "snp",
        variants: [
          { rsid: "rs1234567", chromosome: "1", position: 12345, genotype: "AG", gene: "BRCA1" },
          { rsid: "rs7654321", chromosome: "7", position: 67890, genotype: "CC", gene: "MTHFR" },
        ],
      });
      expect(res.status).toBe(201);
      expect(res.body.profileId).toBeDefined();
      expect(res.body.variantsImported).toBe(2);
    });
  });

  describe("GET /api/genomics/profiles", () => {
    it("lists imported profiles", async () => {
      await request(app).post("/api/genomics/import").set(AUTH).send({
        source: "23andme", profileType: "snp", variants: [],
      });
      const res = await request(app).get("/api/genomics/profiles").set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].source).toBe("23andme");
    });
  });

  describe("GET /api/genomics/variants", () => {
    it("queries variants by rsid", async () => {
      await request(app).post("/api/genomics/import").set(AUTH).send({
        source: "23andme", profileType: "snp",
        variants: [{ rsid: "rs1234567", chromosome: "1", position: 12345, genotype: "AG", gene: "BRCA1" }],
      });
      const res = await request(app).get("/api/genomics/variants?rsid=rs1234567").set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].genotype).toBe("AG");
    });

    it("queries variants by gene", async () => {
      await request(app).post("/api/genomics/import").set(AUTH).send({
        source: "23andme", profileType: "snp",
        variants: [
          { rsid: "rs1234567", chromosome: "1", position: 12345, genotype: "AG", gene: "MTHFR" },
          { rsid: "rs9999999", chromosome: "2", position: 54321, genotype: "TT", gene: "APOE" },
        ],
      });
      const res = await request(app).get("/api/genomics/variants?gene=MTHFR").set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });
});
