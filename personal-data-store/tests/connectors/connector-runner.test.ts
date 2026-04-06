import { describe, it, expect, beforeEach } from "vitest";
import { runConnector } from "../../src/connectors/connector.runner.js";
import { db } from "../../src/db/index.js";
import { connectorRuns } from "../../src/system/system.schema.js";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/setup.js";
import type { Connector } from "../../src/connectors/connector.interface.js";

describe("Connector Runner", () => {
  beforeEach(async () => { await resetDb(); });

  it("logs a successful run", async () => {
    const mockConnector: Connector = {
      name: "test_connector", schedule: null,
      async sync() { return { recordsSynced: 5 }; },
    };
    const result = await runConnector(mockConnector);
    expect(result.recordsSynced).toBe(5);

    const runs = await db.select().from(connectorRuns).where(eq(connectorRuns.connector, "test_connector"));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("success");
    expect(runs[0].recordsSynced).toBe(5);
  });

  it("logs a failed run", async () => {
    const mockConnector: Connector = {
      name: "failing_connector", schedule: null,
      async sync() { throw new Error("API down"); },
    };
    const result = await runConnector(mockConnector);
    expect(result.recordsSynced).toBe(0);
    expect(result.errors).toContain("API down");

    const runs = await db.select().from(connectorRuns).where(eq(connectorRuns.connector, "failing_connector"));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("failed");
    expect(runs[0].error).toBe("API down");
  });
});
