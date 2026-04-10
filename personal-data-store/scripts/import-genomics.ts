import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../src/db/index.js";
import { genomicsProfiles, genomicsVariants } from "../src/domains/genomics/genomics.schema.js";

const SOURCE = "lifecode_gx";

interface Variant {
  gene: string;
  snp: string;
  genotype: string;
  direction: string;
  colour: string;
  result: string;
  section: string;
}

function parseMarkdownTable(lines: string[], section: string): Variant[] {
  const variants: Variant[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect table header row
    if (trimmed.startsWith("| Gene |") || trimmed.startsWith("| Gene|")) {
      inTable = true;
      // Detect if header has Direction column
      const headerCells = trimmed.split("|").map(c => c.trim()).filter(c => c !== "");
      (lines as any).__hasDirection = headerCells.includes("Direction");
      continue;
    }
    // Skip separator row
    if (inTable && trimmed.startsWith("|---") || trimmed.startsWith("| ---")) {
      continue;
    }
    // Parse data row
    if (inTable && trimmed.startsWith("|")) {
      const cells = trimmed.split("|").map(c => c.trim()).filter(c => c !== "");
      const hasDirection = (lines as any).__hasDirection;
      if (hasDirection && cells.length >= 6) {
        variants.push({
          gene: cells[0],
          snp: cells[1],
          genotype: cells[2],
          direction: cells[3],
          colour: cells[4],
          result: cells[5],
          section,
        });
      } else if (!hasDirection && cells.length >= 5) {
        variants.push({
          gene: cells[0],
          snp: cells[1],
          genotype: cells[2],
          direction: "",
          colour: cells[3],
          result: cells[4],
          section,
        });
      }
    } else if (inTable && !trimmed.startsWith("|")) {
      inTable = false;
    }
  }

  return variants;
}

function parseFile(filePath: string): { profileType: string; variants: Variant[] } {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Get profile type from first heading
  const titleLine = lines.find(l => l.startsWith("# "));
  const profileType = titleLine?.replace(/^#\s+/, "").replace(/\s*—.*$/, "").trim() || "unknown";

  // Find sections (### headings)
  const variants: Variant[] = [];
  let currentSection = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      currentSection = line.replace(/^###\s+/, "").trim();
    }
  }

  // Re-parse with sections
  let section = "";
  const chunks: { section: string; lines: string[] }[] = [];
  let currentChunk: string[] = [];

  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (currentChunk.length > 0) {
        chunks.push({ section, lines: currentChunk });
      }
      section = line.replace(/^###\s+/, "").trim();
      currentChunk = [];
    } else {
      currentChunk.push(line);
    }
  }
  if (currentChunk.length > 0) {
    chunks.push({ section, lines: currentChunk });
  }

  for (const chunk of chunks) {
    variants.push(...parseMarkdownTable(chunk.lines, chunk.section));
  }

  return { profileType, variants };
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Usage: tsx scripts/import-genomics.ts <file1.md> [file2.md] ...");
    process.exit(1);
  }

  let totalVariants = 0;

  for (const filePath of files) {
    console.log(`\nProcessing ${filePath}...`);
    const { profileType, variants } = parseFile(filePath);
    console.log(`  Profile: ${profileType}, ${variants.length} variants`);

    // Create profile
    const [profile] = await db.insert(genomicsProfiles).values({
      source: SOURCE,
      profileType,
      rawData: { file: filePath.split("/").pop(), variantCount: variants.length },
    }).returning({ id: genomicsProfiles.id });

    // Insert variants
    for (const v of variants) {
      await db.insert(genomicsVariants).values({
        profileId: profile.id,
        rsid: v.snp.startsWith("rs") ? v.snp : null,
        gene: v.gene,
        genotype: v.genotype,
        metadata: {
          snpLabel: v.snp,
          direction: v.direction,
          colour: v.colour,
          result: v.result,
          section: v.section,
          source: SOURCE,
        },
      });
      totalVariants++;
    }

    console.log(`  Inserted ${variants.length} variants under profile ${profile.id}`);
  }

  console.log(`\nDone: ${totalVariants} total variants imported across ${files.length} profiles.`);
  process.exit(0);
}

main();
