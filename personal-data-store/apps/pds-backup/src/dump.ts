import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export type DumpResult = {
  file: string;
  bytes: number;
  startedAt: string;
  finishedAt: string;
};

export async function dump(): Promise<DumpResult> {
  const startedAt = new Date();
  await mkdir(config.backupDir, { recursive: true });

  const stamp = startedAt
    .toISOString()
    .replace(/[:T]/g, "-")
    .replace(/\..+$/, "");
  const file = path.join(config.backupDir, `pds-${stamp}.dump`);

  // Run pg_dump inside the container; stream its stdout to the host file.
  const args = [
    "exec",
    "-i",
    config.containerName,
    "pg_dump",
    "-U",
    config.pgUser,
    "-d",
    config.pgDatabase,
    "-Fc",
    "--no-owner",
    "--no-acl",
  ];

  await runCmd("docker", args, file);

  const { size } = await stat(file);
  if (size < 1024) {
    throw new Error(`Dump file suspiciously small: ${size} bytes — aborting.`);
  }

  await verify(file);

  return {
    file,
    bytes: size,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

async function verify(file: string): Promise<void> {
  // pg_restore custom-format requires a seekable file, so we copy it into the
  // container, run --list (which parses the TOC), then remove the temp file.
  const tmp = "/tmp/pds-verify.dump";
  await runCmd("docker", ["cp", file, `${config.containerName}:${tmp}`]);
  try {
    await runCmd("docker", [
      "exec",
      config.containerName,
      "pg_restore",
      "--list",
      tmp,
    ]);
  } finally {
    await runCmd("docker", [
      "exec",
      config.containerName,
      "rm",
      "-f",
      tmp,
    ]).catch(() => {/* best-effort cleanup */});
  }
}

function runCmd(
  cmd: string,
  args: string[],
  stdoutFile?: string,
  stdinBuffer?: Buffer,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: [
        stdinBuffer ? "pipe" : "ignore",
        stdoutFile ? "pipe" : "inherit",
        "pipe",
      ],
    });
    const timeout = setTimeout(() => child.kill("SIGTERM"), config.timeoutMs);
    const errChunks: Buffer[] = [];
    child.stderr?.on("data", (c) => errChunks.push(c));

    if (stdoutFile && child.stdout) {
      const ws = createWriteStream(stdoutFile);
      child.stdout.pipe(ws);
    }
    if (stdinBuffer && child.stdin) {
      child.stdin.on("error", () => {
        // Ignore EPIPE — the child may close stdin early (e.g. pg_restore --list)
        // before we finish writing; that's fine, we rely on the exit code instead.
      });
      child.stdin.end(stdinBuffer);
    }

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) return resolve();
      reject(
        new Error(
          `${cmd} ${args.join(" ")} exited ${code}: ${Buffer.concat(errChunks).toString()}`,
        ),
      );
    });
    child.on("error", reject);
  });
}

async function readToStdin(file: string): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  return readFile(file);
}
