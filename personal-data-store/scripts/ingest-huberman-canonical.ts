import "dotenv/config";
import { readFileSync } from "node:fs";
import { createDocument } from "../src/domains/documents/documents.service.js";

async function main() {
  const path = process.argv[2] ?? "/tmp/huberman-transcript.txt";
  const content = readFileSync(path, "utf8").trim();
  if (!content) throw new Error("empty transcript");

  const doc = await createDocument({
    domain: "fitness",
    type: "transcript",
    title: "How Many Weekly Sets Improve Muscle Strength | Dr. Andrew Huberman",
    content,
    source: "import:youtube",
    metadata: {
      channel: "Huberman Lab Clips",
      youtube_id: "cwuSyiFrWi8",
      url: "https://www.youtube.com/watch?v=cwuSyiFrWi8",
      transcript_source: "youtube_auto_captions",
    },
    canonicalFor: ["fitness.strength", "fitness.muscle_growth"],
  });

  console.log(JSON.stringify({ id: doc.id, title: doc.title }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
