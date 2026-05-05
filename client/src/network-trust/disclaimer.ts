/**
 * Canonical disclaimer text for the Jinn daemon.
 *
 * Normative source: spec/2026-05-05-plug-in-and-harness-network-trust.md §11.
 * This module is the single source of truth imported by:
 *   - client/src/cli/commands/run.ts  (first-run full disclaimer)
 *   - client/src/cli/commands/solver-plugins.ts  (abridged install reminder)
 *   - client/src/cli/commands/harnesses.ts  (abridged install reminder)
 */

export const CANONICAL_DISCLAIMER = `\
The Jinn daemon runs an autonomous learning agent that reads the network's
corpus, adapts its own strategy, and executes code from any third-party
plug-ins or harnesses you have installed. Run the daemon in an isolated
environment. Recommended: a fresh VM, a Docker / devcontainer with no
host volumes mounted beyond the daemon's working directory, or a dedicated
user account on a machine you do not use for anything else. Do not run
the daemon alongside personal credentials, signing keys, or production
wallets.

Third-party plug-ins and harnesses are not reviewed or audited by Jinn.
By installing one, you accept that its code will run with the daemon's
full capabilities (including network egress, filesystem access within
the daemon's user, and any wallet keys held in the daemon's keystore).
You are responsible for evaluating each plug-in or harness's source.

The daemon will not autonomously install plug-ins or harnesses. The
learning agent may recommend ones it observed in the corpus;
recommendations are written to ~/.jinn-client/recommendations.jsonl
for your review. Installing a recommendation is your explicit step
(jinn solver-plugins add <name> or jinn harnesses add <name>), at which
point a content-hash is bound and any future change to the package's
content forces re-approval.`;

export const ABRIDGED_DISCLAIMER = `\
Reminder: Jinn does not audit third-party code. You are responsible
for evaluating each plug-in's source. Run the daemon in an isolated
environment.`;
