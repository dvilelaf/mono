import { db } from "../../db/index.js";
import { genomicsProfiles, genomicsVariants } from "./genomics.schema.js";
import { eq, and, desc } from "drizzle-orm";

interface VariantInput {
  rsid?: string;
  chromosome?: string;
  position?: number;
  genotype?: string;
  gene?: string;
  metadata?: Record<string, unknown>;
}

interface ImportInput {
  source: string;
  profileType: string;
  variants: VariantInput[];
  rawData?: Record<string, unknown>;
}

export async function importProfile(input: ImportInput) {
  const [profile] = await db
    .insert(genomicsProfiles)
    .values({
      source: input.source,
      profileType: input.profileType,
      rawData: input.rawData,
    })
    .returning();

  if (input.variants.length > 0) {
    await db.insert(genomicsVariants).values(
      input.variants.map((v) => ({
        profileId: profile.id,
        rsid: v.rsid,
        chromosome: v.chromosome,
        position: v.position,
        genotype: v.genotype,
        gene: v.gene,
        metadata: v.metadata,
      }))
    );
  }

  return { profileId: profile.id, variantsImported: input.variants.length };
}

export async function listProfiles() {
  return db.select().from(genomicsProfiles).orderBy(desc(genomicsProfiles.importedAt));
}

export async function queryVariants(filters: { rsid?: string; gene?: string; profileId?: string }) {
  const conditions = [];
  if (filters.rsid) conditions.push(eq(genomicsVariants.rsid, filters.rsid));
  if (filters.gene) conditions.push(eq(genomicsVariants.gene, filters.gene));
  if (filters.profileId) conditions.push(eq(genomicsVariants.profileId, filters.profileId));

  return db
    .select()
    .from(genomicsVariants)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
}
