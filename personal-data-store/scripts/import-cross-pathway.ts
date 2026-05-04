import "dotenv/config";
import { db } from "../src/db/index.js";
import { documents } from "../src/domains/documents/documents.schema.js";
import { genomicsVariants } from "../src/domains/genomics/genomics.schema.js";
import { inArray, or, eq } from "drizzle-orm";

// Look up variant IDs by gene name or rsid
async function findVariantIds(geneOrRsids: string[]): Promise<string[]> {
  const genes = geneOrRsids.filter(g => !g.startsWith("rs"));
  const rsids = geneOrRsids.filter(g => g.startsWith("rs"));

  const conditions = [];
  if (genes.length) conditions.push(inArray(genomicsVariants.gene, genes));
  if (rsids.length) conditions.push(inArray(genomicsVariants.rsid, rsids));
  if (!conditions.length) return [];

  const rows = await db.select({ id: genomicsVariants.id, gene: genomicsVariants.gene, rsid: genomicsVariants.rsid })
    .from(genomicsVariants)
    .where(or(...conditions));

  return rows.map(r => r.id);
}

const findings = [
  {
    title: "SAMe Supply-Demand Crisis",
    confidence: "high",
    pathways: ["Methylation", "Histamine", "Nervous System", "Detoxification"],
    genes: ["RFC1", "MTHFR", "DHFR", "BHMT", "PEMT", "CHDH", "CBS", "COMT", "HNMT", "ASMT", "PNMT"],
    summary: "SAMe production is impaired at every step while demand from COMT, HNMT, ASMT, and PNMT exceeds supply. Systemic methylation bottleneck degrades four neurotransmitter/immune pathways simultaneously.",
    mechanism: "RFC1 TT limits folate uptake. MTHFR C677T AG reduces methylfolate by ~40%. DHFR ID depletes the methylene-THF pool. BHMT shortcut impaired at two SNPs. PEMT TT and CHDH CC reduce choline synthesis. CBS AG pulls homocysteine away from methionine recycling. Meanwhile COMT, HNMT, ASMT, PNMT all require SAMe as methyl donor and are already slow.",
    clinicalImplication: "Every SAMe-dependent reaction operates under supply constraint. Symptoms diffuse and cyclical — worse during stress, poor sleep, or inflammation.",
    standardPitfall: "Individual reports recommend 'ensure adequate folate.' Synthetic folic acid trapped by upregulated DHFR. High-dose methyl donors without titration risk overstimulating COMT pathways.",
    recommendation: "Folinic acid as primary folate form. Low-dose methylfolate (100-200µg) titrated slowly. Aggressive choline intake. Betaine (TMG) to feed BHMT shortcut. Avoid folic acid entirely.",
  },
  {
    title: "Dopamine Instability Paradox",
    confidence: "high",
    pathways: ["Nervous System", "Methylation"],
    genes: ["VDR", "COMT", "TH", "SLC6A3", "DRD2", "MAOB"],
    summary: "Not high or low dopamine but unstable dopamine — synthesis partially impaired, clearance slow but reuptake fast, receptors less sensitive. Under-stimulated at receptor despite catecholamine accumulation.",
    mechanism: "VDR double-red reduces synthesis. TH GA partially compensates. COMT AG slows breakdown. SLC6A3 CC increases reuptake. DRD2 variants reduce receptor density. Result: synaptic availability low while systemic levels accumulate.",
    clinicalImplication: "Low motivation and focus difficulty despite adequate catecholamine levels. Stimulants produce initial benefit then exaggerated stress response via ADRB1/ADRB2.",
    standardPitfall: "Dopamine precursors (tyrosine, phenylalanine) risk catecholamine excess outside synapse while doing little for actual synaptic deficit.",
    recommendation: "Focus on receptor sensitisation: aerobic exercise upregulates DRD2. High-dose vitamin D for VDR. Uridine + omega-3 DHA for receptor membrane function. Avoid stacking precursors with methylation support.",
  },
  {
    title: "Quadruple Histamine Clearance Failure",
    confidence: "high",
    pathways: ["Histamine", "Methylation", "Detoxification", "Nervous System"],
    genes: ["DAO", "HNMT", "NAT2", "MAOB", "GPX1", "MTHFR", "RFC1", "CBS"],
    summary: "All four histamine degradation routes impaired: DAO (gut), HNMT (intracellular, SAMe-dependent), NAT2 (acetylation), MAOB (downstream). SAMe deficit further throttles the HNMT backup pathway.",
    mechanism: "DAO rs10156191 TC slow. HNMT rs11558538 TC slow and SAMe-constrained. NAT2 rs1801280 CC slow acetylation. MAOB CC slow downstream clearance. GPX1 AG reduces peroxide clearance from histamine metabolism. Cascade where each failure loads the others.",
    clinicalImplication: "High susceptibility to histamine accumulation. Alcohol is particularly potent trigger (releases histamine, inhibits DAO). NSAIDs flagged as hypersensitivity risk.",
    standardPitfall: "Reports recommend fermented foods for gut health, quercetin as anti-inflammatory, green tea — all high-histamine or histamine-liberating.",
    recommendation: "Low-histamine diet during flares. DAO enzyme before meals. Prioritise SAMe regeneration. Vitamin C supports histamine degradation. Avoid fermented foods, aged proteins, alcohol.",
  },
  {
    title: "Serotonin-Melatonin Cascade Failure",
    confidence: "high",
    pathways: ["Nervous System", "Methylation", "Metabolics"],
    genes: ["MTHFR", "QDPR", "TPH1", "VDR", "IFN-gamma", "TNF", "CRP", "HTR1A", "HTR2A", "ASMT", "CLOCK", "PER1"],
    summary: "Six-step cascade: reduced BH4 → impaired serotonin synthesis → kynurenine diversion → presynaptic inhibition → impaired melatonin conversion → circadian disruption. Self-reinforcing loop.",
    mechanism: "MTHFR reduces BH4. QDPR impairs BH4 recycling. TPH1 variants reduce synthesis. VDR double-red reduces vitamin D-mediated synthesis. IFN-gamma/TNF/CRP activate kynurenine pathway diverting tryptophan. HTR1A GG reduces serotonin release. ASMT GG impairs serotonin→melatonin conversion (SAMe-dependent). CLOCK/PER1 disrupt circadian rhythm.",
    clinicalImplication: "Chronic low-grade serotonin insufficiency with poor melatonin. Not classic depression but difficulty with sleep, low stress resilience, seasonal worsening.",
    standardPitfall: "5-HTP increases presynaptic autoinhibition via HTR1A GG. St John's Wort induces CYP3A4/CYP2C19.",
    recommendation: "BH4 support via folinic acid, B2, B3. Omega-3 2-3g EPA+DHA to reduce kynurenine steal. High-dose vitamin D. Exogenous melatonin 0.3-0.5mg. Light management critical for CLOCK/PER1.",
  },
  {
    title: "The Quercetin Trap",
    confidence: "high",
    pathways: ["Detoxification", "Histamine", "Nervous System"],
    genes: ["COMT", "CYP1B1", "HNMT", "ADRB1", "ADRB2"],
    summary: "Quercetin recommended across multiple reports for CYP1B1 inhibition, anti-inflammatory, MAOA reduction. But it potently inhibits already-slow COMT, worsening catecholamine and histamine accumulation.",
    mechanism: "COMT AG already slow. Quercetin inhibition slows catecholamine clearance further, slows HNMT-pathway histamine clearance, and amplifies stress response via ADRB1 CC and ADRB2 AG.",
    clinicalImplication: "Quercetin supplementation may produce paradoxical anxiety, insomnia, elevated blood pressure, or histamine flares.",
    standardPitfall: "'Use quercetin to reduce CYP1B1 activity and inflammation' — each report recommends it for a legitimate single-pathway reason.",
    recommendation: "Replace with EGCG, olive oil polyphenols for CYP1B1. Omega-3, curcumin for anti-inflammatory (curcumin does not inhibit COMT at normal doses). If quercetin used at all, minimal doses.",
  },
  {
    title: "Phase 1 / Phase 2 Detox Mismatch",
    confidence: "high",
    pathways: ["Detoxification"],
    genes: ["CYP1B1", "CYP1A2", "GSTM1", "GSTP1", "SULT2A1", "SULT1A1", "NAT2", "GSS"],
    summary: "Phase 1 enzymes upregulated generating reactive intermediates. Phase 2 conjugation impaired at multiple points including absent GSTM1. Reactive intermediates accumulate.",
    mechanism: "CYP1B1 amber variants and CYP1A2 AC generate reactive intermediates including 4-hydroxy oestrogens. GSTM1 absent (zero capacity), GSTP1 GA reduced, SULT2A1 CC poor, NAT2 CC slow, SULT1A1 TC reduced. GSS variants impair glutathione synthesis.",
    clinicalImplication: "Higher baseline genotoxic load. Increased vulnerability to PAHs, xenoestrogens, aromatic amines.",
    standardPitfall: "Cruciferous vegetables induce Phase 1 CYP enzymes outpacing Phase 2 capacity. Net effect of high cruciferous intake could increase reactive intermediates.",
    recommendation: "Moderate cruciferous intake. NAC 600-1200mg/day. Alpha-lipoic acid. Selenium for GPX1. Avoid chargrilled/smoked foods. Calcium d-glucarate for glucuronidation.",
  },
  {
    title: "Glutathione Under Siege From Both Sides",
    confidence: "high",
    pathways: ["Detoxification", "Methylation", "Metabolics"],
    genes: ["GSTM1", "GSS", "GPX1", "SOD2", "CBS", "CRP", "TNF", "IFN-gamma", "IL6"],
    summary: "Demand: GSTM1 absent, SOD2 slow, pro-inflammatory genotype depletes glutathione. Supply: GSS impaired at final synthesis step. The single most important molecule to address.",
    mechanism: "GSTM1 absent increases demand on remaining GSTs. SOD2 slow means more oxidative stress consuming glutathione. CRP/TNF/IFN-gamma/IL6 chronically deplete. GSS double-variant limits synthesis. CBS AG sends cysteine but GSS bottleneck prevents conversion.",
    clinicalImplication: "Chronically low glutathione near-certain. Affects detoxification, histamine metabolism, and inflammatory damage.",
    standardPitfall: "Reports recommend sulphur-containing foods. CBS upregulation means excess sulphur amino acids generate ammonia rather than efficiently building glutathione.",
    recommendation: "NAC most direct intervention. Liposomal glutathione bypasses GSS. Alpha-lipoic acid recycles glutathione. Selenium supports GPX1. Moderate protein to limit CBS-driven ammonia.",
  },
  {
    title: "The Magnesium Form Paradox",
    confidence: "high",
    pathways: ["Nervous System", "Histamine", "Methylation"],
    genes: ["GAD2", "GABRA2", "CBS", "COMT"],
    summary: "Magnesium glycinate and taurate cause paradoxical sleep disruption. Predictable from genotype: low GABA + desensitised receptors + glycine's NMDA co-agonism.",
    mechanism: "GAD2 AA reduces GABA. GABRA2 CT reduces receptor sensitivity. Glycine from magnesium glycinate is NMDA co-agonist, tipping excitatory/inhibitory balance. CBS AG may convert glycine increasing ammonia (excitatory).",
    clinicalImplication: "Confirmed experientially. Not idiosyncratic — predictable from genotype.",
    standardPitfall: "'Take magnesium glycinate for sleep' — standard functional medicine advice that is contraindicated here.",
    recommendation: "Magnesium malate (morning), threonate (CNS delivery without excitatory cargo), or citrate. No glycinate or taurate, especially evening.",
  },
  {
    title: "Catecholamine Stress Amplification Loop",
    confidence: "high",
    pathways: ["Nervous System", "Detoxification", "Metabolics"],
    genes: ["TH", "COMT", "MAOB", "PNMT", "ADRB1", "ADRB2", "CYP1A2", "ADORA2A", "ACE"],
    summary: "More synthesis + slower clearance + higher receptor sensitivity = disproportionate stress response. Caffeine maximally amplified and prolonged in this genotype.",
    mechanism: "TH GA increases production. COMT AG and MAOB CC slow clearance. PNMT AG slows noradrenaline→adrenaline conversion. ADRB1 CC high sensitivity. CYP1A2 AC normal-slow caffeine metabolism. ADORA2A CT increased caffeine sensitivity.",
    clinicalImplication: "Exaggerated stress reactivity. Caffeine tolerance lower than perceived — subjective need conflicts with physiological capacity.",
    standardPitfall: "'Moderate caffeine is fine' — contraindicated. Any benefit to dopamine outweighed by catecholamine surge that cannot be cleared.",
    recommendation: "Caffeine ≤80mg/day morning only. Structured parasympathetic activation: dive reflex, 4-7-8 breathing, moderate aerobic exercise (not HIIT during high stress).",
  },
  {
    title: "GABA Deficit + Reward-Seeking + Alcohol Vulnerability Triad",
    confidence: "high",
    pathways: ["Nervous System", "Histamine", "Detoxification"],
    genes: ["GAD2", "GABRA2", "DRD2", "FAAH", "ADH1C", "DAO", "HNMT", "NAT2", "GSTM1"],
    summary: "Genotype creates the drive toward alcohol (GABA deficit + reward deficiency) while making alcohol maximally harmful (fast acetaldehyde + quadruple histamine clearance failure + absent GSTM1).",
    mechanism: "GAD2 AA low GABA. GABRA2 CT reduced sensitivity (associated with alcohol dependence risk). DRD2 variants reduce reward. FAAH AC increases impulsivity. ADH1C double-red fast acetaldehyde. All four histamine clearance pathways impaired.",
    clinicalImplication: "Even moderate drinking produces disproportionate flushing, headache, congestion, GI distress, and hangover severity.",
    standardPitfall: "Valerian as GABA agonist is reasonable but doesn't address dopamine deficit driving reward-seeking.",
    recommendation: "Alcohol avoidance or strict minimisation. L-theanine 200-400mg for GABA support. Rosmarinic acid (lemon balm). Magnesium threonate. Exercise as primary DRD2 upregulator.",
  },
  {
    title: "Vitamin D Resistance Cascade",
    confidence: "high",
    pathways: ["Nutrient Core", "Nervous System", "Metabolics"],
    genes: ["VDR", "GC", "BDNF", "VKORC1", "HMGCR", "CRP", "TNF"],
    summary: "VDR double-red means vitamin D arrives but cellular response is blunted. Affects serotonin, dopamine, BDNF, bone density, and immune modulation. Standard targets insufficient.",
    mechanism: "VDR rs1544410 TT + rs731236 GG reduce receptor response. GC TT green means transport fine. HMGCR CT reduces endogenous synthesis. VKORC1 TT impairs vitamin K recycling. BDNF TC already reduced and vitamin D is an activator.",
    clinicalImplication: "Standard supplementation may produce adequate serum 25(OH)D while remaining functionally insufficient at receptor level.",
    standardPitfall: "'Test and supplement to 50-75 nmol/L' — insufficient for VDR double-red.",
    recommendation: "Target 100-125 nmol/L. 4000-5000 IU/day D3 with K2 MK-7 200µg. Test every 3 months. Treat as neurological and immune intervention, not just bone health.",
  },
  {
    title: "The Fat Metabolism Trap",
    confidence: "high",
    pathways: ["Metabolics"],
    genes: ["PLIN1", "FABP2", "UCP1", "FTO", "LDLR", "SREBF1"],
    summary: "More fat absorbed + less burned + stored in wrong places + less LDL cleared + more cholesterol synthesised + drive toward calorie-dense food. Standard metrics misleading.",
    mechanism: "PLIN1 TT ectopic fat deposition and weight loss resistance. FABP2 CT increased absorption. UCP1 CC reduced thermogenesis. FTO AA increased calorie preference. LDLR double-hit reduces clearance. SREBF1 AG increases synthesis.",
    clinicalImplication: "Standard weight metrics misleading — BCA and waist circumference are meaningful tools. May appear metabolically healthy while accumulating visceral/hepatic fat.",
    standardPitfall: "Fasting, cold exposure, ketogenic diets — PLIN1 TT specifically contradicts these. High-fat diets worsen ectopic deposition.",
    recommendation: "Higher complex carb, moderate protein, lower fat. Prioritise fibre. PUFAs/MUFAs over saturated. Berberine for LDLR/glucose. Monitor liver enzymes and triglycerides, not just weight.",
  },
];

async function main() {
  console.log("Looking up variant IDs...\n");

  for (const f of findings) {
    const variantIds = await findVariantIds(f.genes);
    console.log(`${f.title}: ${variantIds.length} variants matched from ${f.genes.length} genes`);

    await db.insert(documents).values({
      domain: "genomics",
      type: "analysis",
      title: f.title,
      content: [
        `## Mechanism\n${f.mechanism}`,
        `## Clinical Implication\n${f.clinicalImplication}`,
        `## Standard Pitfall\n${f.standardPitfall}`,
        `## Adjusted Recommendation\n${f.recommendation}`,
      ].join("\n\n"),
      metadata: {
        analysisType: "cross_pathway",
        summary: f.summary,
        confidence: f.confidence,
        entities: { variantIds, genes: f.genes, pathways: f.pathways },
        result: {
          pathways: f.pathways,
          mechanism: f.mechanism,
          clinicalImplication: f.clinicalImplication,
          standardPitfall: f.standardPitfall,
          recommendation: f.recommendation,
        },
        sourceQuery: {
          source: "lifecode_gx_cross_pathway_analysis",
          method: "multi_report_interaction_map",
          variantMatchCriteria: f.genes,
        },
      },
    });
  }

  console.log(`\nDone: ${findings.length} cross-pathway analyses imported.`);
  process.exit(0);
}

main();
