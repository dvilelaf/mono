import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { config } from "./config.js";

export type RestoreOptions = {
  file: string;
  targetDb: string;
  allowProdRestore?: boolean;
};

export async function restore(opts: RestoreOptions): Promise<void> {
  // Guard: refuse to restore over the prod DB unless explicitly allowed.
  // Most-specific check first: is this the configured production database?
  if (opts.targetDb === config.pgDatabase && !opts.allowProdRestore) {
    throw new Error(
      `restore() refused: target database "${opts.targetDb}" matches the production database ` +
        `(config.pgDatabase="${config.pgDatabase}"). Pass --allow-prod to override.`,
    );
  }

  // Softer check: does it look like a non-prod name?
  const looksLikeTest = /test|restore|scratch/i.test(opts.targetDb);
  if (!looksLikeTest && !opts.allowProdRestore) {
    throw new Error(
      `restore() refused: target database "${opts.targetDb}" doesn't look like a scratch/test DB. ` +
        `Pass --allow-prod to override.`,
    );
  }

  const st = await stat(opts.file);
  if (st.size < 1024) {
    throw new Error(`Dump file too small: ${opts.file}`);
  }

  // pg_restore's custom format requires a seekable file — it cannot be fed via
  // stdin (Task 2 confirmed this: piping to pg_restore fails with "No such file
  // or directory"). Replicate the dump.ts verify() pattern: copy the dump into
  // the container, run pg_restore against the in-container path, then clean up.
  const tmp = "/tmp/pds-restore.dump";
  await runCmd("docker", ["cp", opts.file, `${config.containerName}:${tmp}`]);

  try {
    await runCmd("docker", [
      "exec",
      config.containerName,
      "pg_restore",
      "-U",
      config.pgUser,
      "-d",
      opts.targetDb,
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      tmp,
    ]);
  } finally {
    await runCmd("docker", [
      "exec",
      config.containerName,
      "rm",
      "-f",
      tmp,
    ]).catch(() => {
      /* best-effort cleanup */
    });
  }
}

function runCmd(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "inherit", "inherit"],
    });
    const timeout = setTimeout(() => child.kill("SIGTERM"), config.timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timeout);
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
    child.on("error", reject);
  });
}
