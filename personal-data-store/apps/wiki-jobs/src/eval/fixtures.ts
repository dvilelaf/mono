import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export interface ReadMeExpectation {
  required: boolean;
  maxAgeDays: number;
  maxWords: number;
  requiredSectionPatterns: string[];
}

export interface BlockerPageExpectation {
  requireBlocksGoalLink: boolean;
  requireSmallestNextAction: boolean;
}

export interface FixtureExpectations {
  goalPages: string[];
  minBlockersPerGoal: number;
  requireBlockerLinksResolve: boolean;
  requireTopBlockersSection: boolean;
  readMe: ReadMeExpectation;
  blockerPage: BlockerPageExpectation;
}

export interface Fixture {
  name: string;
  job: "extract" | "analyse" | "synthesise";
  description?: string;
  expectations: FixtureExpectations;
}

export async function loadFixtures(dir: string): Promise<Fixture[]> {
  const entries = await readdir(dir);
  const fixtures: Fixture[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const raw = await readFile(path.join(dir, name), "utf8");
    fixtures.push(JSON.parse(raw) as Fixture);
  }
  fixtures.sort((a, b) => a.name.localeCompare(b.name));
  return fixtures;
}
