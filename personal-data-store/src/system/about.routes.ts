import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { semanticSearch } from "../domains/documents/documents.service.js";

export const aboutRouter = Router();

aboutRouter.get("/", async (req, res, next) => {
  try {
    const topic = (req.query.topic as string) || "";
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);

    if (!topic) {
      res.status(400).json({ error: "topic is required" });
      return;
    }

    const pattern = `%${topic}%`;

    const [
      documentsResult,
      healthResult,
      workoutsResult,
      financeResult,
      genomicsResult,
      businessResult,
      analysesResult,
    ] = await Promise.allSettled([
      // documents: semantic search over embeddings; falls back to [] if no matches/embeddings
      semanticSearch(topic, limit).catch(() => [] as unknown[]),

      // health: match on metric_type
      db.execute(sql`
        SELECT id, metric_type, value, unit, source, recorded_at, metadata
        FROM health_metrics
        WHERE metric_type ILIKE ${pattern}
        ORDER BY recorded_at DESC
        LIMIT ${limit}
      `),

      // workouts: match on name
      db.execute(sql`
        SELECT id, name, source, started_at, ended_at, duration, active_energy, avg_heart_rate
        FROM workouts
        WHERE name ILIKE ${pattern}
        ORDER BY started_at DESC
        LIMIT ${limit}
      `),

      // finance: yield positions, transactions, subscriptions in parallel slots inside one Promise
      Promise.all([
        db.execute(sql`
          SELECT 'yield_position' AS record_type, id, name, protocol, chain, token,
                 value_usd, apy, snapshot_at, NULL::text AS description, NULL::text AS category
          FROM yield_positions
          WHERE name ILIKE ${pattern}
             OR protocol ILIKE ${pattern}
             OR token ILIKE ${pattern}
          ORDER BY snapshot_at DESC
          LIMIT ${limit}
        `),
        db.execute(sql`
          SELECT 'transaction' AS record_type, id, NULL::text AS name, NULL::text AS protocol,
                 NULL::text AS chain, NULL::text AS token, amount AS value_usd, NULL::numeric AS apy,
                 date AS snapshot_at, description, category
          FROM transactions
          WHERE description ILIKE ${pattern}
             OR category ILIKE ${pattern}
          ORDER BY date DESC
          LIMIT ${limit}
        `),
        db.execute(sql`
          SELECT 'subscription' AS record_type, id, name, NULL::text AS protocol,
                 NULL::text AS chain, NULL::text AS token, amount AS value_usd, NULL::numeric AS apy,
                 last_seen::timestamptz AS snapshot_at, description, category
          FROM subscriptions
          WHERE name ILIKE ${pattern}
             OR description ILIKE ${pattern}
             OR category ILIKE ${pattern}
          ORDER BY last_seen DESC
          LIMIT ${limit}
        `),
      ]).then(([yields, txs, subs]) => [
        ...(yields as unknown[]),
        ...(txs as unknown[]),
        ...(subs as unknown[]),
      ].slice(0, limit * 3)),

      // genomics: variants by gene or rsid
      db.execute(sql`
        SELECT id, rsid, gene, chromosome, genotype, metadata
        FROM genomics_variants
        WHERE gene ILIKE ${pattern}
           OR rsid ILIKE ${pattern}
        LIMIT ${limit}
      `),

      // business: clients and projects
      db.execute(sql`
        SELECT * FROM (
          SELECT 'client' AS record_type, id, name, status, created_at FROM clients
          WHERE name ILIKE ${pattern}
          UNION ALL
          SELECT 'project' AS record_type, id, name, status, created_at FROM projects
          WHERE name ILIKE ${pattern}
        ) AS combined
        ORDER BY created_at DESC
        LIMIT ${limit}
      `),

      // analyses: match on title or summary
      db.execute(sql`
        SELECT id, domain, analysis_type, title, summary, source, created_at
        FROM analyses
        WHERE title ILIKE ${pattern}
           OR summary ILIKE ${pattern}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `),
    ]);

    const pick = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === "fulfilled" ? result.value : fallback;

    res.json({
      documents: pick(documentsResult, [] as unknown[]),
      health: pick(healthResult, [] as unknown[]),
      workouts: pick(workoutsResult, [] as unknown[]),
      finance: pick(financeResult, [] as unknown[]),
      genomics: pick(genomicsResult, [] as unknown[]),
      business: pick(businessResult, [] as unknown[]),
      analyses: pick(analysesResult, [] as unknown[]),
    });
  } catch (err) {
    next(err);
  }
});
