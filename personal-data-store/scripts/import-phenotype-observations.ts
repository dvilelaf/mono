import "dotenv/config";
import { db } from "../src/db/index.js";
import { documents } from "../src/domains/documents/documents.schema.js";

const observations = {
  confirmed: [
    { topic: "Catecholamine Clearance", status: "strongly_confirmed", genes: ["COMT", "MAOB", "PNMT", "ADRB1", "ADRB2"], note: "Stress downregulation takes until following day. Most robustly confirmed pathway." },
    { topic: "Caffeine Sensitivity", status: "strongly_confirmed", genes: ["CYP1A2", "ADORA2A"], note: "Tolerance limit ~one single espresso. Beyond produces adverse effects." },
    { topic: "Baseline Vigilance / Low GABA", status: "confirmed", genes: ["GAD2", "GABRA2", "FAAH"], note: "Vigilant baseline confirmed. Has progressively found healthier interventions." },
    { topic: "2-4am Alert Waking", status: "confirmed_with_modifier", genes: ["CLOCK", "PER1", "ASMT", "COMT", "ADRB1", "TH"], note: "Confirmed; modulated by sugar/refined carb consumption — controlling these resolves or improves it." },
    { topic: "Dopamine Instability / Motivation", status: "historically_confirmed_currently_improved", genes: ["VDR", "DRD2", "SLC6A3", "COMT", "MAOB"], note: "Historical pattern improved. Cause unclear — possibly vitamin D + exercise." },
    { topic: "Seasonal Mood Variation", status: "historically_confirmed_currently_improved", genes: ["VDR", "TPH1", "MTHFR", "HTR1A"], note: "Resolved environmentally; genotype unchanged so maintain interventions." },
    { topic: "Baseline Anxiety", status: "historically_confirmed_currently_managed", genes: ["GAD2", "GABRA2", "COMT", "ADRB1", "ADRB2", "HTR1A"], note: "Maintenance of current interventions essential." },
    { topic: "Appetite / Calorie-Dense Preference", status: "confirmed", genes: ["FTO", "LEPR", "POMC", "BDNF", "FAAH"], note: "Conscious diet management required; natural satiety unreliable." },
    { topic: "Chemical Sensitivity", status: "possibly_confirmed", genes: ["GSTM1", "CYP1B1"], note: "Strong sensitivity to chemical smells. Petrol smell attraction noteworthy — aromatic hydrocarbon metabolism implication." },
    { topic: "Clarithromycin Insomnia", status: "confirmed_pharmacogenomic", genes: ["CYP3A4", "COMT", "ADRB1"], note: "Bad insomnia with clarithromycin. Flag macrolide antibiotics." },
    { topic: "Recurrent Minor Illness", status: "possibly_confirmed", genes: ["CRP", "TNF", "IFN-gamma", "IL6", "GSTM1", "GSS"], note: "Recurring minor illness; immune dysregulation rather than immunodeficiency." },
    { topic: "Slow/Deliberate Processing", status: "possibly_brain_fog", genes: ["GSTM1", "GSS", "CRP", "TNF", "IL6"], note: "Subjective slow thinking. May respond to NAC/glutathione, omega-3, methylation support." },
  ],
  contradicted: [
    { topic: "Lactose Intolerance", genes: ["LCT"], note: "LCT GG predicts intolerance — phenotype is fully tolerant. Microbiome adaptation. Dairy retained for K2/calcium/protein." },
    { topic: "NSAID Hypersensitivity", genes: ["DAO"], note: "DAO TC association does not manifest. Ibuprofen tolerated well." },
    { topic: "Alcohol as GABA Substitute", genes: ["GABRA2", "GAD2"], note: "Alcohol does not calm — sometimes pumps up. Catecholamine release overrides GABA effect. Lower dependence risk than predicted." },
    { topic: "Disproportionate Hangovers", genes: ["ADH1C", "GSTM1"], note: "ADH1C double-red predicts severe hangovers — not observed. ALDH2 GG likely compensates downstream." },
  ],
  ambiguous: [
    { topic: "Histamine Intolerance", genes: ["DAO", "HNMT", "NAT2", "MAOB"], note: "Some red wine discomfort but no classic reaction. Provocation test needed. DAO supplementation low-cost insurance." },
    { topic: "Carbohydrate-Mood Link", genes: [], note: "Effect recognised but weak. Tryptophan-rich protein preferable to carb loading." },
    { topic: "Vitamin D Status", genes: ["VDR", "HMGCR"], note: "Recently tested, not flagged abnormal — but level/test type unknown. Retrieve actual 25(OH)D value vs 100 nmol/L target." },
  ],
  principle: "Genotype is hypothesis; phenotype is data. Many variants are compensated by other variants, environment, or microbiome adaptation. Cross-pathway analysis correctly identifies worst-case collision points but will overpredict.",
};

async function main() {
  const content = [
    "## Confirmed (genotype matches phenotype)",
    ...observations.confirmed.map(o => `- **${o.topic}** [${o.status}] genes: ${o.genes.join(", ")} — ${o.note}`),
    "",
    "## Contradicted (genotype prediction does not manifest)",
    ...observations.contradicted.map(o => `- **${o.topic}** genes: ${o.genes.join(", ")} — ${o.note}`),
    "",
    "## Ambiguous (insufficient data or partial signal)",
    ...observations.ambiguous.map(o => `- **${o.topic}** genes: ${o.genes.join(", ")} — ${o.note}`),
    "",
    "## Key Principle",
    observations.principle,
  ].join("\n");

  await db.insert(documents).values({
    domain: "genomics",
    type: "analysis",
    title: "Phenotype Observations — Genotype Offset Register",
    content,
    metadata: {
      analysisType: "phenotype_observations",
      summary: "Lived-experience confirmations, contradictions, and ambiguities against Lifecode Gx genotype predictions. Prevents genotype-driven recommendations from overriding empirical reality.",
      confidence: "high",
      entities: { observations },
      result: observations,
      sourceQuery: { source: "user_phenotype_register", method: "lived_experience_offset_against_lifecode_gx" },
    },
  });

  console.log("Phenotype observations imported.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
