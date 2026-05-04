module.exports = {
  apps: [
    {
      name: "pds-backup",
      cwd: __dirname,
      script: "./node_modules/.bin/tsx",
      args: "src/index.ts",
      env: {
        NODE_ENV: "production",
        ICLOUD_BACKUP_DIR:
          "/Users/gcd/Library/Mobile Documents/com~apple~CloudDocs/pds-backups",
      },
      max_memory_restart: "300M",
      out_file: "/tmp/pds-backup.out.log",
      error_file: "/tmp/pds-backup.err.log",
      time: true,
    },
  ],
};
