import { db } from "../db/index.js";
import { connectorRuns } from "../system/system.schema.js";
import { eq } from "drizzle-orm";
import type { Connector, SyncResult, SyncOptions } from "./connector.interface.js";

export async function runConnector(connector: Connector, options?: SyncOptions): Promise<SyncResult> {
  const [run] = await db
    .insert(connectorRuns)
    .values({ connector: connector.name, status: "running", startedAt: new Date() })
    .returning();

  try {
    const result = await connector.sync(options);
    await db.update(connectorRuns).set({
      status: "success", finishedAt: new Date(), recordsSynced: result.recordsSynced,
    }).where(eq(connectorRuns.id, run.id));
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(connectorRuns).set({
      status: "failed", finishedAt: new Date(), recordsSynced: 0, error: message,
    }).where(eq(connectorRuns.id, run.id));
    return { recordsSynced: 0, errors: [message] };
  }
}
