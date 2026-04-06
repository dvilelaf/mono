import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const genomicsProfiles = pgTable("genomics_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  profileType: text("profile_type").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const genomicsVariants = pgTable(
  "genomics_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").notNull().references(() => genomicsProfiles.id),
    rsid: text("rsid"),
    chromosome: text("chromosome"),
    position: integer("position"),
    genotype: text("genotype"),
    gene: text("gene"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("genomics_variants_rsid_idx").on(table.rsid),
    index("genomics_variants_gene_idx").on(table.gene),
  ]
);
