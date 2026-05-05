import { interventionsConnector } from "../src/connectors/interventions.connector.js";

async function main() {
  const result = await interventionsConnector.sync();
  console.log(`[interventions-eval] records=${result.recordsSynced ?? 0}`);
  if (result.errors?.length) {
    console.error(`[interventions-eval] errors:`);
    for (const e of result.errors) console.error(`  - ${e}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
