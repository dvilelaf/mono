import type { Connector, SyncResult } from "./connector.interface.js";
import { sendNtfy, frontendUrl } from "../services/ntfy.js";
import { checkinSummary, recordMissedDay } from "../domains/checkin/checkin.service.js";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export const checkinMorningConnector: Connector = {
  name: "checkin_morning",
  schedule: process.env.CHECKIN_MORNING_SCHEDULE ?? "0 7 * * *",
  async sync(): Promise<SyncResult> {
    const day = todayKey();
    const summary = await checkinSummary(day);
    const errors: string[] = [];
    if (summary.complete) {
      return { recordsSynced: 0 };
    }
    const totalActive = summary.supplements.totalActive;
    const message = totalActive > 0
      ? `${totalActive} supplement${totalActive === 1 ? "" : "s"} on today's stack. Tap to log.`
      : "Log supplements, training, and a rough food note for today.";
    const result = await sendNtfy({
      title: "Daily check-in",
      message,
      click: frontendUrl("/today"),
      priority: 3,
      tags: ["checkin", "morning"],
    });
    if (!result.ok) errors.push(`ntfy: ${result.error}`);
    return { recordsSynced: 1, errors: errors.length ? errors : undefined };
  },
};

export const checkinEveningConnector: Connector = {
  name: "checkin_evening",
  schedule: process.env.CHECKIN_EVENING_SCHEDULE ?? "0 21 * * *",
  async sync(): Promise<SyncResult> {
    const day = todayKey();
    const summary = await checkinSummary(day);
    const errors: string[] = [];
    if (summary.complete) {
      return { recordsSynced: 0 };
    }

    const missing: string[] = [];
    if (summary.supplements.totalActive > 0 && summary.supplements.taken === 0) {
      missing.push("supplements");
    }
    if (summary.measurements.length === 0) missing.push("measurements");
    if (summary.nutrition.length === 0) missing.push("food");

    const message = missing.length
      ? `Still missing: ${missing.join(", ")}.`
      : "Tap to log today's protocol.";

    const result = await sendNtfy({
      title: "Check-in still open",
      message,
      click: frontendUrl("/today"),
      priority: 4,
      tags: ["checkin", "evening"],
    });
    if (!result.ok) errors.push(`ntfy: ${result.error}`);

    try {
      await recordMissedDay(day, "checkin", `evening reminder: ${missing.join(",") || "incomplete"}`);
    } catch (err) {
      errors.push(`miss log: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { recordsSynced: 1, errors: errors.length ? errors : undefined };
  },
};
