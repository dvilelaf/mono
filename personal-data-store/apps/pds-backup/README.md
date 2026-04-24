# pds-backup

Daily compressed pg_dump of the PDS Postgres DB. Retention: last 30 daily + first-of-month for last 12 months. Optional iCloud mirror.

## Commands

- `npm run backup` — dump + prune now
- `npm run prune` — prune only
- `npm run restore <file> <target-db> [--allow-prod]` — restore guarded by target DB name

## HTTP

- `GET /status` — config + running flag
- `POST /backup` — trigger a backup now

## Env

- `BACKUP_DIR` (default `~/Backups/pds/`)
- `ICLOUD_BACKUP_DIR` (default empty — no mirror)
- `BACKUP_CRON` (default `0 3 * * *`)
- `BACKUP_KEEP_DAILY` (default 30)
- `BACKUP_KEEP_MONTHLY` (default 12)
- `PDS_BACKUP_PORT` (default 3110)

## Restore example

```bash
# create a scratch DB
docker exec personal-data-store-postgres-1 createdb -U pds pds_restore_test
# restore
npm run restore ~/Backups/pds/pds-2026-04-23-03-00-00.dump pds_restore_test
```

## Pm2

```bash
pm2 start apps/pds-backup/ecosystem.config.cjs
pm2 save
```
