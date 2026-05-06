import { db } from "../../db/index.js";
import { graphNodes, graphEdges } from "./graph.schema.js";
import { genomicsVariants } from "./genomics.schema.js";
import { interventions } from "../interventions/interventions.schema.js";
import { and, eq, inArray, or, sql } from "drizzle-orm";

export type NodeType = "variant" | "constraint" | "intervention" | "metric" | "goal";
export type Relation =
  | "implies"          // variant → constraint
  | "contraindicates"  // constraint → intervention
  | "recommends"       // constraint → intervention
  | "affects"          // intervention → metric
  | "serves"           // metric → goal, intervention → goal
  | "modulates";       // generic catch-all

export interface NodeInput {
  nodeType: NodeType | string;
  slug: string;
  label: string;
  payload?: Record<string, unknown> | null;
}

export interface EdgeInput {
  from: { nodeType: string; slug: string };
  to: { nodeType: string; slug: string };
  relation: Relation | string;
  evidence?: string | null;
  confidence?: number | null;
  payload?: Record<string, unknown> | null;
}

export async function upsertNode(input: NodeInput) {
  const [row] = await db
    .insert(graphNodes)
    .values({
      nodeType: input.nodeType,
      slug: input.slug,
      label: input.label,
      payload: input.payload ?? null,
    })
    .onConflictDoUpdate({
      target: [graphNodes.nodeType, graphNodes.slug],
      set: {
        label: input.label,
        payload: input.payload ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function upsertEdge(input: EdgeInput) {
  const [from] = await db
    .select()
    .from(graphNodes)
    .where(and(eq(graphNodes.nodeType, input.from.nodeType), eq(graphNodes.slug, input.from.slug)));
  const [to] = await db
    .select()
    .from(graphNodes)
    .where(and(eq(graphNodes.nodeType, input.to.nodeType), eq(graphNodes.slug, input.to.slug)));
  if (!from) throw new Error(`graph: from-node not found: ${input.from.nodeType}/${input.from.slug}`);
  if (!to) throw new Error(`graph: to-node not found: ${input.to.nodeType}/${input.to.slug}`);

  const [row] = await db
    .insert(graphEdges)
    .values({
      fromNodeId: from.id,
      toNodeId: to.id,
      relation: input.relation,
      evidence: input.evidence ?? null,
      confidence: input.confidence !== undefined && input.confidence !== null ? String(input.confidence) : null,
      payload: input.payload ?? null,
    })
    .onConflictDoUpdate({
      target: [graphEdges.fromNodeId, graphEdges.toNodeId, graphEdges.relation],
      set: {
        evidence: input.evidence ?? null,
        confidence: input.confidence !== undefined && input.confidence !== null ? String(input.confidence) : null,
        payload: input.payload ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function listNodes(filter?: { nodeType?: string; slug?: string }) {
  const conds = [];
  if (filter?.nodeType) conds.push(eq(graphNodes.nodeType, filter.nodeType));
  if (filter?.slug) conds.push(eq(graphNodes.slug, filter.slug));
  const q = db.select().from(graphNodes);
  return conds.length ? await q.where(and(...conds)) : await q;
}

export async function listEdges(filter?: {
  fromSlug?: string; fromType?: string;
  toSlug?: string; toType?: string;
  relation?: string;
}) {
  // Build a single SELECT with joins so callers get the slug/label of both ends.
  const fromN = sql`fn`;
  const toN = sql`tn`;
  const rows = await db.execute<{
    id: string; relation: string; evidence: string | null; confidence: string | null;
    from_id: string; from_type: string; from_slug: string; from_label: string;
    to_id: string; to_type: string; to_slug: string; to_label: string;
    payload: unknown;
  }>(sql`
    SELECT e.id, e.relation, e.evidence, e.confidence, e.payload,
           fn.id AS from_id, fn.node_type AS from_type, fn.slug AS from_slug, fn.label AS from_label,
           tn.id AS to_id,   tn.node_type AS to_type,   tn.slug AS to_slug,   tn.label AS to_label
      FROM graph_edges e
      JOIN graph_nodes fn ON fn.id = e.from_node_id
      JOIN graph_nodes tn ON tn.id = e.to_node_id
     WHERE (${filter?.relation ?? null}::text IS NULL OR e.relation = ${filter?.relation ?? null})
       AND (${filter?.fromType ?? null}::text IS NULL OR fn.node_type = ${filter?.fromType ?? null})
       AND (${filter?.fromSlug ?? null}::text IS NULL OR fn.slug = ${filter?.fromSlug ?? null})
       AND (${filter?.toType ?? null}::text IS NULL OR tn.node_type = ${filter?.toType ?? null})
       AND (${filter?.toSlug ?? null}::text IS NULL OR tn.slug = ${filter?.toSlug ?? null})
     ORDER BY e.created_at DESC
  `);
  return rows;
}

// Variant nodes are slugged as `<gene>:<rsid>:<genotype>` (lowercased) so
// we can match a user's actual variants to curated graph entries.
export function variantSlug(parts: { gene?: string | null; rsid?: string | null; genotype?: string | null }) {
  const gene = (parts.gene ?? "").trim();
  const rsid = (parts.rsid ?? "").trim().toLowerCase();
  const genotype = (parts.genotype ?? "").trim().toUpperCase();
  return `${gene}:${rsid}:${genotype}`;
}

// Given a profile, return the constraints the user's variants imply, the
// interventions those constraints contraindicate, and the metrics/goals
// each surviving intervention would affect. The output is the spine of
// the decision oracle's contraindication check.
export async function profileGraphSummary(profileId: string) {
  const variants = await db
    .select()
    .from(genomicsVariants)
    .where(eq(genomicsVariants.profileId, profileId));

  if (variants.length === 0) {
    return { variantSlugs: [], constraints: [], contraindications: [], recommendations: [] };
  }

  const slugs = variants.map(variantSlug);

  // Constraints: variants -> implies -> constraints
  const constraintRows = await db.execute<{
    constraint_slug: string; constraint_label: string;
    variant_slug: string; evidence: string | null; confidence: string | null;
  }>(sql`
    SELECT c.slug AS constraint_slug, c.label AS constraint_label,
           v.slug AS variant_slug, e.evidence, e.confidence
      FROM graph_edges e
      JOIN graph_nodes v ON v.id = e.from_node_id AND v.node_type = 'variant'
      JOIN graph_nodes c ON c.id = e.to_node_id AND c.node_type = 'constraint'
     WHERE e.relation = 'implies' AND v.slug = ANY(${slugs}::text[])
  `);

  if (constraintRows.length === 0) {
    return { variantSlugs: slugs, constraints: [], contraindications: [], recommendations: [] };
  }

  const constraintSlugs = Array.from(new Set(constraintRows.map((r) => r.constraint_slug)));

  // Interventions blocked or recommended by those constraints
  const interventionRows = await db.execute<{
    relation: string; constraint_slug: string;
    intervention_slug: string; intervention_label: string;
    evidence: string | null; confidence: string | null;
  }>(sql`
    SELECT e.relation, c.slug AS constraint_slug,
           i.slug AS intervention_slug, i.label AS intervention_label,
           e.evidence, e.confidence
      FROM graph_edges e
      JOIN graph_nodes c ON c.id = e.from_node_id AND c.node_type = 'constraint'
      JOIN graph_nodes i ON i.id = e.to_node_id AND i.node_type = 'intervention'
     WHERE e.relation IN ('contraindicates', 'recommends')
       AND c.slug = ANY(${constraintSlugs}::text[])
  `);

  const contraindications = interventionRows.filter((r) => r.relation === "contraindicates");
  const recommendations = interventionRows.filter((r) => r.relation === "recommends");

  return {
    variantSlugs: slugs,
    constraints: constraintRows,
    contraindications,
    recommendations,
  };
}

// "Given my variants, which metric should this intervention move?" — used
// by the intervention ledger to decide where to look for a signal.
export async function interventionImpact(interventionSlug: string) {
  const rows = await db.execute<{
    relation: string;
    target_type: string; target_slug: string; target_label: string;
    evidence: string | null; confidence: string | null;
  }>(sql`
    SELECT e.relation,
           t.node_type AS target_type, t.slug AS target_slug, t.label AS target_label,
           e.evidence, e.confidence
      FROM graph_edges e
      JOIN graph_nodes i ON i.id = e.from_node_id AND i.node_type = 'intervention'
      JOIN graph_nodes t ON t.id = e.to_node_id
     WHERE e.relation IN ('affects', 'serves')
       AND i.slug = ${interventionSlug}
     ORDER BY t.node_type, t.slug
  `);
  // Also expand: metrics → serves → goals (one hop).
  const metricSlugs = rows.filter((r) => r.target_type === "metric").map((r) => r.target_slug);
  let metricGoals: Array<{
    relation: string; target_type: string; target_slug: string; target_label: string;
    evidence: string | null; confidence: string | null;
  }> = [];
  if (metricSlugs.length > 0) {
    const goalRows = await db.execute<{
      relation: string; target_type: string; target_slug: string; target_label: string;
      evidence: string | null; confidence: string | null;
    }>(sql`
      SELECT 'metric_serves_goal'::text AS relation,
             g.node_type AS target_type, g.slug AS target_slug, g.label AS target_label,
             e.evidence, e.confidence
        FROM graph_edges e
        JOIN graph_nodes m ON m.id = e.from_node_id AND m.node_type = 'metric'
        JOIN graph_nodes g ON g.id = e.to_node_id   AND g.node_type = 'goal'
       WHERE e.relation = 'serves' AND m.slug = ANY(${metricSlugs}::text[])
    `);
    metricGoals = goalRows.map((r) => ({ ...r }));
  }
  return {
    intervention: interventionSlug,
    direct: rows,
    viaMetric: metricGoals,
  };
}

// Check a candidate intervention (by slug) against the user's most recent
// genomics profile. Returns matched contraindications with the offending
// variant + constraint so the decision oracle can surface them verbatim.
export async function checkContraindication(opts: { interventionSlug: string; profileId?: string }) {
  // Find latest profile if not specified
  let profileId = opts.profileId;
  if (!profileId) {
    const [latest] = await db.execute<{ id: string }>(sql`
      SELECT id FROM genomics_profiles ORDER BY imported_at DESC LIMIT 1
    `);
    profileId = latest?.id;
  }
  if (!profileId) {
    return { intervention: opts.interventionSlug, profileId: null, contraindicated: false, hits: [] };
  }

  const variants = await db
    .select()
    .from(genomicsVariants)
    .where(eq(genomicsVariants.profileId, profileId));
  const slugs = variants.map(variantSlug);
  if (slugs.length === 0) {
    return { intervention: opts.interventionSlug, profileId, contraindicated: false, hits: [] };
  }

  const hits = await db.execute<{
    variant_slug: string; constraint_slug: string; constraint_label: string;
    evidence: string | null; confidence: string | null;
  }>(sql`
    SELECT v.slug AS variant_slug,
           c.slug AS constraint_slug, c.label AS constraint_label,
           e2.evidence, e2.confidence
      FROM graph_edges e1
      JOIN graph_nodes v ON v.id = e1.from_node_id AND v.node_type = 'variant'
      JOIN graph_nodes c ON c.id = e1.to_node_id   AND c.node_type = 'constraint'
      JOIN graph_edges e2 ON e2.from_node_id = c.id AND e2.relation = 'contraindicates'
      JOIN graph_nodes i ON i.id = e2.to_node_id AND i.node_type = 'intervention'
     WHERE e1.relation = 'implies'
       AND v.slug = ANY(${slugs}::text[])
       AND i.slug = ${opts.interventionSlug}
  `);

  return {
    intervention: opts.interventionSlug,
    profileId,
    contraindicated: hits.length > 0,
    hits,
  };
}

// Resolve intervention slugs that exist in the interventions table but
// have no corresponding graph node yet — used to surface curation gaps.
export async function ungraphedInterventions() {
  const rows = await db.execute<{ slug: string; title: string }>(sql`
    SELECT i.slug, i.title
      FROM interventions i
     WHERE NOT EXISTS (
       SELECT 1 FROM graph_nodes n WHERE n.node_type = 'intervention' AND n.slug = i.slug
     )
     ORDER BY i.slug
  `);
  return rows;
}

// Use the schema imports above to keep type-checking honest even though
// most reads go through raw SQL for graph traversal.
void interventions;
void or;
void inArray;
