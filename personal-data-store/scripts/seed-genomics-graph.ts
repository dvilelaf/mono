// Seed the genomics knowledge graph with the curated variant → constraint
// → intervention → metric → goal logic from Oak's CLAUDE.md and the
// existing canonical health docs.
//
// Re-runnable: every node and edge is upserted by stable slug, so this
// script is safe to run on every deploy.
import { upsertNode, upsertEdge } from "../src/domains/genomics/graph.service.js";

interface SeedNode {
  nodeType: string;
  slug: string;
  label: string;
  payload?: Record<string, unknown>;
}

interface SeedEdge {
  from: { nodeType: string; slug: string };
  to: { nodeType: string; slug: string };
  relation: string;
  evidence?: string;
  confidence?: number;
}

// --- Variants -----------------------------------------------------------
// Slug convention matches src/domains/genomics/graph.service.ts#variantSlug:
// `<gene>:<rsid>:<genotype>`. Where the rsid is unknown or the constraint
// applies at the gene level we use the gene-level slug `<gene>::<genotype>`.
const NODES: SeedNode[] = [
  // Variants
  { nodeType: "variant", slug: "COMT::AG", label: "COMT AG (slow catecholamine clearance)",
    payload: { gene: "COMT", genotype: "AG", note: "Slow catecholamine clearance — caution with stimulants and methyl donors at high dose." } },
  { nodeType: "variant", slug: "VDR::double-red", label: "VDR double-red (vitamin D receptor inefficiency)",
    payload: { gene: "VDR", genotype: "double-red", note: "Higher serum 25(OH)D target needed to compensate for receptor inefficiency." } },
  { nodeType: "variant", slug: "LDLR::double-hit", label: "LDLR double-hit (LDL clearance impairment)",
    payload: { gene: "LDLR", genotype: "double-hit", note: "Cardiovascular priority — ApoB and LDL targets must be aggressive." } },
  { nodeType: "variant", slug: "PLIN1::TT", label: "PLIN1 TT (ectopic fat storage)",
    payload: { gene: "PLIN1", genotype: "TT", note: "Ectopic fat tendency — visceral and liver fat over subcutaneous." } },
  { nodeType: "variant", slug: "ABCB1::impaired", label: "ABCB1 impaired (transporter)",
    payload: { gene: "ABCB1", genotype: "impaired", note: "Reduced drug/xenobiotic efflux — piperine raises systemic exposure to coadministered compounds." } },
  { nodeType: "variant", slug: "MTHFR::impaired", label: "MTHFR impaired (folate cycle)",
    payload: { gene: "MTHFR", genotype: "impaired", note: "Reduced conversion of folic acid to active 5-MTHF — synthetic folic acid contraindicated." } },

  // Constraints
  { nodeType: "constraint", slug: "slow-catecholamine-clearance", label: "Slow catecholamine clearance" },
  { nodeType: "constraint", slug: "vitamin-d-receptor-inefficiency", label: "Vitamin D receptor inefficiency" },
  { nodeType: "constraint", slug: "ldl-clearance-impairment", label: "LDL clearance impairment" },
  { nodeType: "constraint", slug: "ectopic-fat-tendency", label: "Ectopic fat tendency" },
  { nodeType: "constraint", slug: "abcb1-transporter-impaired", label: "ABCB1 transporter impaired" },
  { nodeType: "constraint", slug: "folic-acid-conversion-impaired", label: "Folic acid conversion impaired" },
  { nodeType: "constraint", slug: "magnesium-glycinate-taurate-intolerance", label: "Magnesium glycinate/taurate intolerance",
    payload: { note: "User-reported intolerance — track separately from genetic constraints." } },
  { nodeType: "constraint", slug: "quercetin-intolerance", label: "Quercetin intolerance",
    payload: { note: "User-reported intolerance." } },

  // Interventions (slugs match supplements/protocols Oak uses; align with
  // interventions table slugs where possible).
  { nodeType: "intervention", slug: "magnesium-glycinate", label: "Magnesium glycinate" },
  { nodeType: "intervention", slug: "magnesium-taurate", label: "Magnesium taurate" },
  { nodeType: "intervention", slug: "magnesium-malate", label: "Magnesium malate" },
  { nodeType: "intervention", slug: "magnesium-bisglycinate", label: "Magnesium bisglycinate" },
  { nodeType: "intervention", slug: "quercetin", label: "Quercetin" },
  { nodeType: "intervention", slug: "folic-acid", label: "Folic acid (synthetic)" },
  { nodeType: "intervention", slug: "methylfolate", label: "L-methylfolate (5-MTHF)" },
  { nodeType: "intervention", slug: "piperine", label: "Piperine (black pepper extract)" },
  { nodeType: "intervention", slug: "curcumin-with-piperine", label: "Curcumin with piperine" },
  { nodeType: "intervention", slug: "vitamin-d-5000-iu", label: "Vitamin D3 5000 IU + K2-MK7" },
  { nodeType: "intervention", slug: "berberine-500mg", label: "Berberine 500mg twice daily" },
  { nodeType: "intervention", slug: "resistance-training-2x", label: "Resistance training 2×/week" },
  { nodeType: "intervention", slug: "protein-1.6g-per-kg", label: "Protein 1.6g/kg/day" },
  { nodeType: "intervention", slug: "stimulant-high-dose", label: "High-dose stimulants (caffeine, modafinil)" },

  // Metrics — names match health_metrics.metric_type where applicable.
  { nodeType: "metric", slug: "apob", label: "ApoB" },
  { nodeType: "metric", slug: "total_cholesterol", label: "Total cholesterol" },
  { nodeType: "metric", slug: "ldl_cholesterol", label: "LDL cholesterol" },
  { nodeType: "metric", slug: "hs_crp", label: "hsCRP" },
  { nodeType: "metric", slug: "vitamin_d", label: "Serum 25(OH)D" },
  { nodeType: "metric", slug: "homocysteine", label: "Homocysteine" },
  { nodeType: "metric", slug: "waist_circumference", label: "Waist circumference" },
  { nodeType: "metric", slug: "weight_body_mass", label: "Body weight" },
  { nodeType: "metric", slug: "body_fat_percentage", label: "Body fat %" },
  { nodeType: "metric", slug: "visceral_fat", label: "Visceral fat" },

  // Goals — slugs match goals table.
  { nodeType: "goal", slug: "apob-below-90", label: "ApoB below 90 mg/dL" },
  { nodeType: "goal", slug: "hs-crp-below-1", label: "hsCRP below 1.0 mg/L" },
  { nodeType: "goal", slug: "vitamin-d-100-125", label: "Vitamin D 100–125 nmol/L" },
  { nodeType: "goal", slug: "waist-80-cm", label: "Waist 80 cm" },
  { nodeType: "goal", slug: "weight-stability", label: "Weight trajectory" },
];

const EDGES: SeedEdge[] = [
  // variant → implies → constraint
  { from: { nodeType: "variant", slug: "COMT::AG" }, to: { nodeType: "constraint", slug: "slow-catecholamine-clearance" }, relation: "implies",
    evidence: "COMT AG reduces enzyme activity ~3× vs GG; catecholamines clear more slowly.", confidence: 0.9 },
  { from: { nodeType: "variant", slug: "VDR::double-red" }, to: { nodeType: "constraint", slug: "vitamin-d-receptor-inefficiency" }, relation: "implies",
    evidence: "VDR double-red genotype reduces vitamin D receptor binding affinity; higher serum target required.", confidence: 0.9 },
  { from: { nodeType: "variant", slug: "LDLR::double-hit" }, to: { nodeType: "constraint", slug: "ldl-clearance-impairment" }, relation: "implies",
    evidence: "LDLR double-hit reduces hepatic LDL receptor density; aggressive ApoB/LDL targets warranted.", confidence: 0.95 },
  { from: { nodeType: "variant", slug: "PLIN1::TT" }, to: { nodeType: "constraint", slug: "ectopic-fat-tendency" }, relation: "implies",
    evidence: "PLIN1 TT shifts fat storage toward visceral/liver depots over subcutaneous.", confidence: 0.85 },
  { from: { nodeType: "variant", slug: "ABCB1::impaired" }, to: { nodeType: "constraint", slug: "abcb1-transporter-impaired" }, relation: "implies",
    evidence: "ABCB1 impairment reduces P-gp efflux; piperine raises systemic exposure to coadministered compounds.", confidence: 0.85 },
  { from: { nodeType: "variant", slug: "MTHFR::impaired" }, to: { nodeType: "constraint", slug: "folic-acid-conversion-impaired" }, relation: "implies",
    evidence: "MTHFR impairment reduces conversion of synthetic folic acid to bioactive 5-MTHF.", confidence: 0.95 },

  // constraint → contraindicates → intervention
  { from: { nodeType: "constraint", slug: "magnesium-glycinate-taurate-intolerance" }, to: { nodeType: "intervention", slug: "magnesium-glycinate" }, relation: "contraindicates",
    evidence: "User-reported intolerance to magnesium glycinate." },
  { from: { nodeType: "constraint", slug: "magnesium-glycinate-taurate-intolerance" }, to: { nodeType: "intervention", slug: "magnesium-taurate" }, relation: "contraindicates",
    evidence: "User-reported intolerance to magnesium taurate." },
  { from: { nodeType: "constraint", slug: "quercetin-intolerance" }, to: { nodeType: "intervention", slug: "quercetin" }, relation: "contraindicates",
    evidence: "User-reported intolerance to quercetin." },
  { from: { nodeType: "constraint", slug: "abcb1-transporter-impaired" }, to: { nodeType: "intervention", slug: "piperine" }, relation: "contraindicates",
    evidence: "ABCB1 impairment + piperine → unpredictable systemic exposure to coadministered compounds. Avoid piperine and any stack containing it." },
  { from: { nodeType: "constraint", slug: "abcb1-transporter-impaired" }, to: { nodeType: "intervention", slug: "curcumin-with-piperine" }, relation: "contraindicates",
    evidence: "Same as piperine alone — ABCB1 impairment makes piperine-enhanced stacks unsafe." },
  { from: { nodeType: "constraint", slug: "folic-acid-conversion-impaired" }, to: { nodeType: "intervention", slug: "folic-acid" }, relation: "contraindicates",
    evidence: "MTHFR impairment + synthetic folic acid → unmetabolised folic acid accumulation. Use methylfolate instead." },
  { from: { nodeType: "constraint", slug: "slow-catecholamine-clearance" }, to: { nodeType: "intervention", slug: "stimulant-high-dose" }, relation: "contraindicates",
    evidence: "Slow catecholamine clearance → high-dose stimulants accumulate; use lower doses or non-stimulant alternatives." },

  // constraint → recommends → intervention
  { from: { nodeType: "constraint", slug: "vitamin-d-receptor-inefficiency" }, to: { nodeType: "intervention", slug: "vitamin-d-5000-iu" }, relation: "recommends",
    evidence: "VDR inefficiency requires higher serum 25(OH)D — 5000 IU/day with K2-MK7 to push into 100–125 nmol/L." },
  { from: { nodeType: "constraint", slug: "ldl-clearance-impairment" }, to: { nodeType: "intervention", slug: "berberine-500mg" }, relation: "recommends",
    evidence: "AMPK-mediated lipid clearance assists impaired LDLR pathway; 500mg twice daily." },
  { from: { nodeType: "constraint", slug: "folic-acid-conversion-impaired" }, to: { nodeType: "intervention", slug: "methylfolate" }, relation: "recommends",
    evidence: "Bypasses MTHFR conversion bottleneck." },
  { from: { nodeType: "constraint", slug: "ectopic-fat-tendency" }, to: { nodeType: "intervention", slug: "resistance-training-2x" }, relation: "recommends",
    evidence: "Resistance training reduces visceral and liver fat preferentially." },
  { from: { nodeType: "constraint", slug: "ectopic-fat-tendency" }, to: { nodeType: "intervention", slug: "protein-1.6g-per-kg" }, relation: "recommends",
    evidence: "Higher protein supports lean mass retention while reducing visceral depots." },

  // intervention → affects → metric
  { from: { nodeType: "intervention", slug: "berberine-500mg" }, to: { nodeType: "metric", slug: "apob" }, relation: "affects" },
  { from: { nodeType: "intervention", slug: "berberine-500mg" }, to: { nodeType: "metric", slug: "total_cholesterol" }, relation: "affects" },
  { from: { nodeType: "intervention", slug: "berberine-500mg" }, to: { nodeType: "metric", slug: "ldl_cholesterol" }, relation: "affects" },
  { from: { nodeType: "intervention", slug: "berberine-500mg" }, to: { nodeType: "metric", slug: "hs_crp" }, relation: "affects" },
  { from: { nodeType: "intervention", slug: "vitamin-d-5000-iu" }, to: { nodeType: "metric", slug: "vitamin_d" }, relation: "affects" },
  { from: { nodeType: "intervention", slug: "methylfolate" }, to: { nodeType: "metric", slug: "homocysteine" }, relation: "affects" },
  { from: { nodeType: "intervention", slug: "resistance-training-2x" }, to: { nodeType: "metric", slug: "waist_circumference" }, relation: "affects" },
  { from: { nodeType: "intervention", slug: "resistance-training-2x" }, to: { nodeType: "metric", slug: "body_fat_percentage" }, relation: "affects" },
  { from: { nodeType: "intervention", slug: "resistance-training-2x" }, to: { nodeType: "metric", slug: "visceral_fat" }, relation: "affects" },
  { from: { nodeType: "intervention", slug: "protein-1.6g-per-kg" }, to: { nodeType: "metric", slug: "weight_body_mass" }, relation: "affects" },

  // metric → serves → goal
  { from: { nodeType: "metric", slug: "apob" }, to: { nodeType: "goal", slug: "apob-below-90" }, relation: "serves" },
  { from: { nodeType: "metric", slug: "hs_crp" }, to: { nodeType: "goal", slug: "hs-crp-below-1" }, relation: "serves" },
  { from: { nodeType: "metric", slug: "vitamin_d" }, to: { nodeType: "goal", slug: "vitamin-d-100-125" }, relation: "serves" },
  { from: { nodeType: "metric", slug: "waist_circumference" }, to: { nodeType: "goal", slug: "waist-80-cm" }, relation: "serves" },
  { from: { nodeType: "metric", slug: "weight_body_mass" }, to: { nodeType: "goal", slug: "weight-stability" }, relation: "serves" },
];

async function main() {
  let nodesUp = 0;
  let edgesUp = 0;
  let errors = 0;
  for (const n of NODES) {
    try {
      await upsertNode(n);
      nodesUp++;
    } catch (err) {
      errors++;
      console.error(`[seed-graph] node ${n.nodeType}/${n.slug} failed:`, err instanceof Error ? err.message : err);
    }
  }
  for (const e of EDGES) {
    try {
      await upsertEdge(e);
      edgesUp++;
    } catch (err) {
      errors++;
      console.error(`[seed-graph] edge ${e.from.nodeType}/${e.from.slug} -[${e.relation}]-> ${e.to.nodeType}/${e.to.slug} failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[seed-graph] upserted ${nodesUp} nodes, ${edgesUp} edges (${errors} errors).`);
  process.exit(errors === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
