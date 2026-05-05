import type { Connector, SyncResult } from "./connector.interface.js";
import { runAllChecks, upsertAlert, type Severity } from "../domains/watchdog/watchdog.service.js";
import { sendNtfy, frontendUrl } from "../services/ntfy.js";

const PRIORITY: Record<Severity, 1 | 2 | 3 | 4 | 5> = { info: 2, warning: 4, critical: 5 };

export const watchdogConnector: Connector = {
  name: "watchdog",
  schedule: process.env.WATCHDOG_SCHEDULE ?? "0 */4 * * *",
  async sync(): Promise<SyncResult> {
    const errors: string[] = [];
    const { alerts } = await runAllChecks();
    let newCount = 0;
    for (const a of alerts) {
      try {
        const r = await upsertAlert(a);
        if (!r.inserted) continue;
        newCount += 1;
        if (a.severity === "info") continue;
        const ntfy = await sendNtfy({
          title: `Watchdog · ${a.severity.toUpperCase()}: ${a.title}`,
          message: a.detail ?? a.title,
          click: frontendUrl("/alerts"),
          priority: PRIORITY[a.severity],
          tags: ["watchdog", a.checkType, a.severity],
        });
        if (!ntfy.ok) errors.push(`ntfy ${a.fingerprint}: ${ntfy.error}`);
      } catch (err) {
        errors.push(`upsert ${a.fingerprint}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { recordsSynced: newCount, errors: errors.length ? errors : undefined };
  },
};
