import { runJob } from "./runner.js";
import type { JobName } from "./config.js";

const job = process.argv[2] as JobName | undefined;

if (!job || !["extract", "analyse", "synthesise"].includes(job)) {
  console.error("usage: tsx src/cli.ts <extract|analyse|synthesise>");
  process.exit(2);
}

runJob(job)
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
