import { Router } from "express";
import { getEloMatchup, processEloComparison, getEloRankings, getAllFilmReviews, deleteFilmReview } from "./media.service.js";

export const mediaRouter = Router();

mediaRouter.get("/film-reviews", async (req, res, next) => {
  try {
    const films = await getAllFilmReviews();
    res.json(films);
  } catch (err) {
    next(err);
  }
});

mediaRouter.delete("/film-reviews/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await deleteFilmReview(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

mediaRouter.get("/film-reviews/elo/matchup", async (req, res, next) => {
  try {
    const seenParam = req.query.seen as string | undefined;
    const seenPairs = seenParam ? seenParam.split(",").filter(Boolean) : [];
    const matchup = await getEloMatchup(seenPairs);
    res.json(matchup);
  } catch (err) {
    next(err);
  }
});

mediaRouter.post("/film-reviews/elo/compare", async (req, res, next) => {
  try {
    const { winnerId, loserId } = req.body;
    if (!winnerId || !loserId) {
      res.status(400).json({ error: "winnerId and loserId are required" });
      return;
    }
    const result = await processEloComparison(winnerId, loserId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

mediaRouter.get("/film-reviews/elo/rankings", async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const rankings = await getEloRankings(limit);
    res.json(rankings);
  } catch (err) {
    next(err);
  }
});
