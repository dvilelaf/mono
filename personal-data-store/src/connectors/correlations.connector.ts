import type { Connector, SyncResult } from "./connector.interface.js";
import { runAllSpecs } from "../domains/correlations/correlations.service.js";

export const correlationsConnector: Connector = {
  name: "correlations",
  schedule: process.env.CORRELATIONS_SCHEDULE ?? "0 4 * * 1",
  async sync(): Promise<SyncResult> {
    const results = await runAllSpecs({ persist: true });
    const errors = results
      .filter((r) => r.status === "error")
      .map((r) => `${r.slug}: ${r.message ?? "error"}`);
    return {
      recordsSynced: results.filter((r) => !!r.documentId).length,
      errors: errors.length ? errors : undefined,
    };
  },
};
