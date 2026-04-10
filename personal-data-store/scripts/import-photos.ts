import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../src/db/index.js";
import { photos } from "../src/domains/media/media.schema.js";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx scripts/import-photos.ts <path-to-json>");
    process.exit(1);
  }

  console.log(`Reading ${filePath}...`);
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>[];
  console.log(`${data.length} photos/videos to import`);

  let imported = 0;
  let skipped = 0;
  const batchSize = 100;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const values = batch.map((p) => {
      const place = p.place as Record<string, unknown> | null;
      const address = place?.address as Record<string, string> | null;
      const dateStr = p.date as string | null;
      const date = dateStr && dateStr > "2000" ? new Date(dateStr) : null;

      return {
        filename: (p.filename as string) || `unknown_${i}`,
        originalFilename: (p.original_filename as string) || null,
        date,
        latitude: (p.latitude as number) || null,
        longitude: (p.longitude as number) || null,
        placeName: (place?.name as string) || null,
        city: address?.city || null,
        country: address?.country || null,
        isPhoto: (p.isphoto as boolean) ?? true,
        isVideo: (p.ismovie as boolean) ?? false,
        persons: (p.persons as string[])?.length ? p.persons : null,
        labels: (p.labels as string[])?.length ? p.labels : null,
        albums: (p.albums as string[])?.length ? p.albums : null,
        metadata: {
          uti: p.uti,
          dateAdded: p.date_added,
          aiCaption: p.ai_caption || null,
        },
      };
    });

    try {
      const result = await db.insert(photos).values(values).onConflictDoNothing().returning({ id: photos.id });
      imported += result.length;
      skipped += batch.length - result.length;
    } catch (err) {
      // Fall back to one-by-one for this batch
      for (const v of values) {
        try {
          const r = await db.insert(photos).values(v).onConflictDoNothing().returning({ id: photos.id });
          if (r.length) imported++; else skipped++;
        } catch { skipped++; }
      }
    }

    if ((i + batchSize) % 5000 === 0 || i + batchSize >= data.length) {
      console.log(`  ${Math.min(i + batchSize, data.length)}/${data.length} processed (${imported} imported, ${skipped} skipped)`);
    }
  }

  console.log(`\nDone: ${imported} imported, ${skipped} skipped/duplicates`);
  process.exit(0);
}

main();
