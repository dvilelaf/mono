import { Router } from "express";
import {
  upsertNode,
  upsertEdge,
  listNodes,
  listEdges,
  profileGraphSummary,
  interventionImpact,
  checkContraindication,
  ungraphedInterventions,
} from "./graph.service.js";

export const graphRouter = Router();

// GET /api/graph/nodes?type=variant&slug=...
graphRouter.get("/nodes", async (req, res, next) => {
  try {
    const nodes = await listNodes({
      nodeType: typeof req.query.type === "string" ? req.query.type : undefined,
      slug: typeof req.query.slug === "string" ? req.query.slug : undefined,
    });
    res.json(nodes);
  } catch (err) { next(err); }
});

// GET /api/graph/edges?fromType=...&fromSlug=...&toType=...&toSlug=...&relation=...
graphRouter.get("/edges", async (req, res, next) => {
  try {
    const edges = await listEdges({
      fromType: typeof req.query.fromType === "string" ? req.query.fromType : undefined,
      fromSlug: typeof req.query.fromSlug === "string" ? req.query.fromSlug : undefined,
      toType: typeof req.query.toType === "string" ? req.query.toType : undefined,
      toSlug: typeof req.query.toSlug === "string" ? req.query.toSlug : undefined,
      relation: typeof req.query.relation === "string" ? req.query.relation : undefined,
    });
    res.json(edges);
  } catch (err) { next(err); }
});

// POST /api/graph/nodes — upsert a node
graphRouter.post("/nodes", async (req, res, next) => {
  try {
    const { nodeType, slug, label, payload } = req.body ?? {};
    if (typeof nodeType !== "string" || typeof slug !== "string" || typeof label !== "string") {
      res.status(400).json({ error: "nodeType, slug, label are required strings" });
      return;
    }
    const row = await upsertNode({ nodeType, slug, label, payload });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// POST /api/graph/edges — upsert an edge by node slug references
graphRouter.post("/edges", async (req, res, next) => {
  try {
    const { from, to, relation, evidence, confidence, payload } = req.body ?? {};
    if (!from?.nodeType || !from?.slug || !to?.nodeType || !to?.slug || typeof relation !== "string") {
      res.status(400).json({ error: "from {nodeType,slug}, to {nodeType,slug} and relation are required" });
      return;
    }
    const row = await upsertEdge({ from, to, relation, evidence, confidence, payload });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// GET /api/graph/profile-summary?profileId=...
// Returns: variants → constraints → contraindications/recommendations.
graphRouter.get("/profile-summary", async (req, res, next) => {
  try {
    const profileId = typeof req.query.profileId === "string" ? req.query.profileId : undefined;
    if (!profileId) { res.status(400).json({ error: "profileId is required" }); return; }
    res.json(await profileGraphSummary(profileId));
  } catch (err) { next(err); }
});

// GET /api/graph/intervention-impact/:slug — what metrics/goals does this intervention move?
graphRouter.get("/intervention-impact/:slug", async (req, res, next) => {
  try {
    res.json(await interventionImpact(req.params.slug));
  } catch (err) { next(err); }
});

// GET /api/graph/contraindication-check/:slug?profileId=... (optional, defaults to latest profile)
graphRouter.get("/contraindication-check/:slug", async (req, res, next) => {
  try {
    const profileId = typeof req.query.profileId === "string" ? req.query.profileId : undefined;
    res.json(await checkContraindication({ interventionSlug: req.params.slug, profileId }));
  } catch (err) { next(err); }
});

// GET /api/graph/ungraphed-interventions — curation gap report
graphRouter.get("/ungraphed-interventions", async (_req, res, next) => {
  try {
    res.json(await ungraphedInterventions());
  } catch (err) { next(err); }
});
