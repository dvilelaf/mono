import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  apiKey: process.env.API_KEY || "",
  webhookSecret: process.env.WEBHOOK_SECRET || "",
  databaseUrl: process.env.DATABASE_URL || "",

  connectors: {
    apple_health: { enabled: true, schedule: null as string | null },
    aura: { enabled: true, schedule: "0 */6 * * *" },
    myfitnesspal: { enabled: true, schedule: "0 */12 * * *" },
    crypto: { enabled: true, schedule: "*/15 * * * *" },
    revolut: { enabled: true, schedule: "0 2 * * *" },
    gmail: { enabled: true, schedule: "0 * * * *" },
    csv_import: { enabled: true, schedule: null as string | null },
    subscriptions: { enabled: true, schedule: "0 3 * * *" },
    goals: { enabled: true, schedule: "0 2 * * *" },
    checkin_morning: { enabled: true, schedule: process.env.CHECKIN_MORNING_SCHEDULE ?? "0 7 * * *" },
    checkin_evening: { enabled: true, schedule: process.env.CHECKIN_EVENING_SCHEDULE ?? "0 21 * * *" },
    morning_briefing: { enabled: true, schedule: process.env.BRIEFING_SCHEDULE ?? "30 6 * * *" },
  },
} as const;
