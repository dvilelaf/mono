import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runAssertions } from "../../apps/wiki-jobs/src/eval/assertions.js";
import type { Fixture } from "../../apps/wiki-jobs/src/eval/fixtures.js";

const fixture: Fixture = {
  name: "test-fx",
  job: "synthesise",
  expectations: {
    goalPages: ["alpha.md", "beta.md"],
    minBlockersPerGoal: 1,
    requireBlockerLinksResolve: true,
    requireTopBlockersSection: true,
    readMe: {
      required: true,
      maxAgeDays: 365 * 10,
      maxWords: 500,
      requiredSectionPatterns: ["top.{0,5}3.{0,10}blockers"],
    },
    blockerPage: {
      requireBlocksGoalLink: true,
      requireSmallestNextAction: true,
    },
  },
};

let dir: string;

async function writeWiki(layout: Record<string, string>) {
  for (const [rel, body] of Object.entries(layout)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "wiki-eval-"));
});

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const goalAlphaOk = `# Goal: alpha\n\n## Top blockers (ranked)\n1. [b1](../blockers/b1.md) — first\n`;
const goalBetaOk = `# Goal: beta\n\n## Top blockers (ranked)\n1. [b2](../blockers/b2.md) — second\n`;
const blockerOk = (slug: string, goal: string) =>
  `# Blocker: ${slug}\n\n## Blocks goal\n[${goal}](../goals/${goal}.md)\n\n## Smallest next action\nDo the thing.\n`;
const readMeOk = `# Read me\n\n## Top 3 blockers\n- one\n- two\n- three\n\nAll well.\n`;

describe("wiki eval assertions", () => {
  it("passes a complete, well-formed wiki", async () => {
    await writeWiki({
      "20-synthesis/goals/alpha.md": goalAlphaOk,
      "20-synthesis/goals/beta.md": goalBetaOk,
      "20-synthesis/blockers/b1.md": blockerOk("b1", "alpha"),
      "20-synthesis/blockers/b2.md": blockerOk("b2", "beta"),
      "20-synthesis/2026-05-04-read-me.md": readMeOk,
    });
    const [r] = await runAssertions([fixture], dir);
    expect(r.failed).toEqual([]);
    expect(r.passed).toBeGreaterThan(0);
  });

  it("flags a missing goal page", async () => {
    const sub = await mkdtemp(path.join(tmpdir(), "wiki-eval-"));
    try {
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/goals"), "alpha.md"),
        goalAlphaOk,
      );
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/blockers"), "b1.md"),
        blockerOk("b1", "alpha"),
      );
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis"), "2026-05-04-read-me.md"),
        readMeOk,
      );
      const [r] = await runAssertions([fixture], sub);
      expect(r.failed.find((f) => f.check === "goal-page-missing")).toBeTruthy();
      expect(r.failed[0].fingerprint).toMatch(/^wiki_eval:/);
    } finally {
      await rm(sub, { recursive: true, force: true });
    }
  });

  it("flags an unresolved blocker link", async () => {
    const sub = await mkdtemp(path.join(tmpdir(), "wiki-eval-"));
    try {
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/goals"), "alpha.md"),
        goalAlphaOk,
      );
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/goals"), "beta.md"),
        goalBetaOk,
      );
      // Only b1 exists, b2 missing
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/blockers"), "b1.md"),
        blockerOk("b1", "alpha"),
      );
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis"), "2026-05-04-read-me.md"),
        readMeOk,
      );
      const [r] = await runAssertions([fixture], sub);
      expect(
        r.failed.find((f) => f.check === "blocker-link-unresolved"),
      ).toBeTruthy();
    } finally {
      await rm(sub, { recursive: true, force: true });
    }
  });

  it("flags read-me too long", async () => {
    const sub = await mkdtemp(path.join(tmpdir(), "wiki-eval-"));
    try {
      const longBody = `# r\n\n## Top 3 blockers\n` + "word ".repeat(800);
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/goals"), "alpha.md"),
        goalAlphaOk,
      );
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/goals"), "beta.md"),
        goalBetaOk,
      );
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/blockers"), "b1.md"),
        blockerOk("b1", "alpha"),
      );
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/blockers"), "b2.md"),
        blockerOk("b2", "beta"),
      );
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis"), "2026-05-04-read-me.md"),
        longBody,
      );
      const [r] = await runAssertions([fixture], sub);
      expect(r.failed.find((f) => f.check === "read-me-too-long")).toBeTruthy();
    } finally {
      await rm(sub, { recursive: true, force: true });
    }
  });

  it("flags a blocker page missing goal link", async () => {
    const sub = await mkdtemp(path.join(tmpdir(), "wiki-eval-"));
    try {
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/goals"), "alpha.md"),
        goalAlphaOk,
      );
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/goals"), "beta.md"),
        goalBetaOk,
      );
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/blockers"), "b1.md"),
        `# Blocker: b1\n\n## Smallest next action\nDo it.\n`,
      );
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis/blockers"), "b2.md"),
        blockerOk("b2", "beta"),
      );
      await writeFile(
        path.join(await ensureDir(sub, "20-synthesis"), "2026-05-04-read-me.md"),
        readMeOk,
      );
      const [r] = await runAssertions([fixture], sub);
      expect(
        r.failed.find((f) => f.check === "blocker-missing-goal-link"),
      ).toBeTruthy();
    } finally {
      await rm(sub, { recursive: true, force: true });
    }
  });
});

async function ensureDir(root: string, rel: string): Promise<string> {
  const full = path.join(root, rel);
  await mkdir(full, { recursive: true });
  return full;
}
