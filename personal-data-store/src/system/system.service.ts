import { db } from "../db/index.js";
import { connectorRuns } from "./system.schema.js";
import { config } from "../config.js";
import { eq, desc } from "drizzle-orm";

export async function getConnectors() {
  const connectorNames = Object.keys(config.connectors) as (keyof typeof config.connectors)[];
  const results = [];
  for (const name of connectorNames) {
    const conf = config.connectors[name];
    const lastRun = await db
      .select()
      .from(connectorRuns)
      .where(eq(connectorRuns.connector, name))
      .orderBy(desc(connectorRuns.startedAt))
      .limit(1);
    results.push({
      name,
      enabled: conf.enabled,
      schedule: conf.schedule,
      lastRun: lastRun[0] || null,
    });
  }
  return results;
}

export async function getConnectorRuns(connectorName: string, limit = 20) {
  return db
    .select()
    .from(connectorRuns)
    .where(eq(connectorRuns.connector, connectorName))
    .orderBy(desc(connectorRuns.startedAt))
    .limit(limit);
}
