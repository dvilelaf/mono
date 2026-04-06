import type { Connector, SyncResult } from "./connector.interface.js";

// Revolut Open Banking API requires:
// 1. Register as a third-party provider or use Revolut Business API
// 2. OAuth2 consent flow for account access
// 3. PSD2 compliance for EU banking data
//
// For personal use, CSV import (via POST /api/finance/import/csv) is the pragmatic path.
// This stub is here for when API access is configured.

export const revolutConnector: Connector = {
  name: "revolut",
  schedule: "0 2 * * *",

  async sync(): Promise<SyncResult> {
    console.log("[revolut] Connector not yet implemented — use CSV import instead");
    return { recordsSynced: 0 };
  },
};
