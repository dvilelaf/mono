import type { Connector, SyncResult } from "./connector.interface.js";

// MyFitnessPal does not have a stable public API.
// Options:
// 1. Use the unofficial MFP API (may break)
// 2. Use a scraping approach
// 3. CSV export + manual import
// For now, this is a stub. Implement sync() when API access is available.

export const myfitnesspalConnector: Connector = {
  name: "myfitnesspal",
  schedule: "0 */12 * * *",

  async sync(): Promise<SyncResult> {
    console.log("[myfitnesspal] Connector not yet implemented — skipping");
    return { recordsSynced: 0 };
  },
};
