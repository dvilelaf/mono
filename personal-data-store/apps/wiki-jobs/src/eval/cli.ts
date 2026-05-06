import { runEval } from "./runner.js";

const report = process.argv.includes("--report");

runEval({ report })
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(2);
  });
