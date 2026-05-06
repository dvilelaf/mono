import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { resetDb } from "../helpers/setup.js";

const AUTH = { Authorization: `Bearer ${process.env.API_KEY}` };

describe("Knowledge graph API", () => {
  beforeEach(async () => { await resetDb(); });

  it("upserts nodes and edges by slug and serves them back", async () => {
    const variant = await request(app).post("/api/graph/nodes").set(AUTH).send({
      nodeType: "variant", slug: "ABCB1::impaired", label: "ABCB1 impaired",
    });
    expect(variant.status).toBe(201);

    const constraint = await request(app).post("/api/graph/nodes").set(AUTH).send({
      nodeType: "constraint", slug: "abcb1-transporter-impaired", label: "ABCB1 transporter impaired",
    });
    expect(constraint.status).toBe(201);

    const intervention = await request(app).post("/api/graph/nodes").set(AUTH).send({
      nodeType: "intervention", slug: "piperine", label: "Piperine",
    });
    expect(intervention.status).toBe(201);

    const e1 = await request(app).post("/api/graph/edges").set(AUTH).send({
      from: { nodeType: "variant", slug: "ABCB1::impaired" },
      to:   { nodeType: "constraint", slug: "abcb1-transporter-impaired" },
      relation: "implies",
      evidence: "ABCB1 impairment reduces P-gp efflux.",
    });
    expect(e1.status).toBe(201);

    const e2 = await request(app).post("/api/graph/edges").set(AUTH).send({
      from: { nodeType: "constraint", slug: "abcb1-transporter-impaired" },
      to:   { nodeType: "intervention", slug: "piperine" },
      relation: "contraindicates",
      evidence: "Piperine + ABCB1 impairment is unsafe.",
    });
    expect(e2.status).toBe(201);

    // Idempotency: re-posting the same edge updates rather than duplicates.
    const e2b = await request(app).post("/api/graph/edges").set(AUTH).send({
      from: { nodeType: "constraint", slug: "abcb1-transporter-impaired" },
      to:   { nodeType: "intervention", slug: "piperine" },
      relation: "contraindicates",
      evidence: "Updated evidence text.",
    });
    expect(e2b.status).toBe(201);

    const edges = await request(app).get("/api/graph/edges?relation=contraindicates").set(AUTH);
    expect(edges.status).toBe(200);
    expect(edges.body).toHaveLength(1);
    expect(edges.body[0].from_slug).toBe("abcb1-transporter-impaired");
    expect(edges.body[0].to_slug).toBe("piperine");
    expect(edges.body[0].evidence).toBe("Updated evidence text.");
  });

  it("flags a contraindication when the user's variant implies a constraint that contraindicates the intervention", async () => {
    // Seed graph: COMT AG → slow catecholamine clearance → contraindicates high-dose stimulants.
    await request(app).post("/api/graph/nodes").set(AUTH).send({ nodeType: "variant", slug: "COMT::AG", label: "COMT AG" });
    await request(app).post("/api/graph/nodes").set(AUTH).send({ nodeType: "constraint", slug: "slow-catecholamine-clearance", label: "Slow catecholamine clearance" });
    await request(app).post("/api/graph/nodes").set(AUTH).send({ nodeType: "intervention", slug: "stimulant-high-dose", label: "High-dose stimulants" });
    await request(app).post("/api/graph/edges").set(AUTH).send({
      from: { nodeType: "variant", slug: "COMT::AG" },
      to:   { nodeType: "constraint", slug: "slow-catecholamine-clearance" },
      relation: "implies",
    });
    await request(app).post("/api/graph/edges").set(AUTH).send({
      from: { nodeType: "constraint", slug: "slow-catecholamine-clearance" },
      to:   { nodeType: "intervention", slug: "stimulant-high-dose" },
      relation: "contraindicates",
      evidence: "Catecholamines accumulate.",
    });

    // Import a profile carrying the COMT AG variant.
    const importRes = await request(app).post("/api/genomics/import").set(AUTH).send({
      source: "23andme", profileType: "snp",
      variants: [{ rsid: "rsCOMT", chromosome: "22", position: 1, genotype: "AG", gene: "COMT" }],
    });
    expect(importRes.status).toBe(201);
    const profileId = importRes.body.profileId;

    // The variant is `<gene>:<rsid>:<genotype>` lowercased rsid; we used a
    // gene-level seed slug `COMT::AG`. Add a matching profile-level node.
    await request(app).post("/api/graph/nodes").set(AUTH).send({ nodeType: "variant", slug: "COMT:rscomt:AG", label: "COMT rsCOMT AG" });
    await request(app).post("/api/graph/edges").set(AUTH).send({
      from: { nodeType: "variant", slug: "COMT:rscomt:AG" },
      to:   { nodeType: "constraint", slug: "slow-catecholamine-clearance" },
      relation: "implies",
    });

    const check = await request(app).get(`/api/graph/contraindication-check/stimulant-high-dose?profileId=${profileId}`).set(AUTH);
    expect(check.status).toBe(200);
    expect(check.body.contraindicated).toBe(true);
    expect(check.body.hits.length).toBeGreaterThan(0);
    expect(check.body.hits[0].constraint_slug).toBe("slow-catecholamine-clearance");
  });

  it("returns intervention impact across affected metrics and goals", async () => {
    // berberine -> affects -> apob -> serves -> apob-below-90 goal
    await request(app).post("/api/graph/nodes").set(AUTH).send({ nodeType: "intervention", slug: "berberine-500mg", label: "Berberine 500mg" });
    await request(app).post("/api/graph/nodes").set(AUTH).send({ nodeType: "metric", slug: "apob", label: "ApoB" });
    await request(app).post("/api/graph/nodes").set(AUTH).send({ nodeType: "goal", slug: "apob-below-90", label: "ApoB below 90" });
    await request(app).post("/api/graph/edges").set(AUTH).send({
      from: { nodeType: "intervention", slug: "berberine-500mg" },
      to:   { nodeType: "metric", slug: "apob" },
      relation: "affects",
    });
    await request(app).post("/api/graph/edges").set(AUTH).send({
      from: { nodeType: "metric", slug: "apob" },
      to:   { nodeType: "goal", slug: "apob-below-90" },
      relation: "serves",
    });

    const res = await request(app).get("/api/graph/intervention-impact/berberine-500mg").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.intervention).toBe("berberine-500mg");
    expect(res.body.direct.some((r: { target_slug: string }) => r.target_slug === "apob")).toBe(true);
    expect(res.body.viaMetric.some((r: { target_slug: string }) => r.target_slug === "apob-below-90")).toBe(true);
  });

  it("returns false from contraindication check when no profile exists", async () => {
    await request(app).post("/api/graph/nodes").set(AUTH).send({ nodeType: "intervention", slug: "any", label: "Any" });
    const res = await request(app).get("/api/graph/contraindication-check/any").set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.contraindicated).toBe(false);
  });
});
