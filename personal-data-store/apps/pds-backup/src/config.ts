import "dotenv/config";
import path from "node:path";
import os from "node:os";

const repoRoot = path.resolve(process.cwd(), "..", "..");

export const config = {
  port: parseInt(process.env.PDS_BACKUP_PORT ?? "3110", 10),
  repoRoot,

  // Postgres target
  containerName: process.env.PG_CONTAINER ?? "personal-data-store-postgres-1",
  pgUser: process.env.PG_USER ?? "pds",
  pgDatabase: process.env.PG_DATABASE ?? "personal_data_store",

  // Backup destination
  backupDir: process.env.BACKUP_DIR ?? path.join(os.homedir(), "Backups", "pds"),
  icloudBackupDir: process.env.ICLOUD_BACKUP_DIR ?? "",

  // Schedule + retention
  cron: process.env.BACKUP_CRON ?? "0 3 * * *", // 03:00 local daily
  cronEnabled: (process.env.BACKUP_CRON_ENABLED ?? "true") === "true",
  keepDaily: parseInt(process.env.BACKUP_KEEP_DAILY ?? "30", 10),
  keepMonthly: parseInt(process.env.BACKUP_KEEP_MONTHLY ?? "12", 10),

  // Misc
  timeoutMs: parseInt(process.env.BACKUP_TIMEOUT_MS ?? String(20 * 60 * 1000), 10),
} as const;
