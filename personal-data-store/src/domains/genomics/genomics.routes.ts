import { Router } from "express";
import { importProfile, listProfiles, queryVariants } from "./genomics.service.js";

export const genomicsRouter = Router();

genomicsRouter.get("/profiles", async (_req, res, next) => {
  try {
    const profiles = await listProfiles();
    res.json(profiles);
  } catch (err) { next(err); }
});

genomicsRouter.get("/variants", async (req, res, next) => {
  try {
    const variants = await queryVariants({
      rsid: req.query.rsid as string | undefined,
      gene: req.query.gene as string | undefined,
      profileId: req.query.profile_id as string | undefined,
    });
    res.json(variants);
  } catch (err) { next(err); }
});

genomicsRouter.post("/import", async (req, res, next) => {
  try {
    const result = await importProfile(req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
});
