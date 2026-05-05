---
name: memory-consolidation
description: Use when the coordinator reaches the Memory consolidation phase. Launch one consolidator subagent that curates implStateDir (prune unused, revert regressions) and workingDir (set public/private boundary); commits durable curation as one separate commit.
allowed-tools: Bash, Read, Write, Edit, Agent
---

# Memory consolidation skill

Launch the consolidator; verify outputs.

## Inputs

- `workingDir/.debrief/analysis.json` (trend signals, regression flags)
- `workingDir/.improve/summary.json` + `promotions/` (Improve's mutations)
- `implStateDir/` and `workingDir/` (full)
- `implStateDir/policy.json` (retention rules, size caps)

## Launch the consolidator

```
Use the Agent tool to spawn a fresh-context subagent with role `consolidator`.
Pass it inputs:
  analysisPath        = workingDir/.debrief/analysis.json
  improveSummaryPath  = workingDir/.improve/summary.json
  improvePromotionsDir = workingDir/.improve/promotions/
  policyPath          = implStateDir/policy.json (or null)
  implStateDir        = <path, read-write>
  workingDir          = <path, read-write>
  outputPath          = workingDir/.memory-consolidation/consolidation_record.json
  msUntilEndTs        = <current value>
The consolidator does both workstreams (durable + ephemeral), writes a
single git commit on implStateDir for the durable curation, and produces
the consolidation_record.
```

## After it returns

Verify the consolidation_record exists. If the consolidator made a commit, `implStateDirShaAfter` must match `git -C <implStateDir> rev-parse HEAD`. If no commit was made (empty curation set), `implStateDirShaAfter` must equal `implStateDirShaBefore` and HEAD remains at that sha.

Return to the coordinator: a one-paragraph summary.

## Boundaries

- Do not promote new content — Improve already did
- Do not modify success criteria, plan, or analysis

## Recommending plug-ins and harnesses

If the consolidator identifies a plug-in or harness in the retained corpus that
should be surfaced to the operator for future adoption, **do not install it**.
Call `recommend_plugin` (for SolverPlugins) or `recommend_harness` (for Harnesses)
with the package name, version, reason, and the corpus envelope refs. The operator
reviews pending recommendations via `jinn solver-plugins recommendations` /
`jinn harnesses recommendations` and decides whether to install.

Never call `yarn add`, `jinn solver-plugins add`, or `jinn harnesses add` from
within a learner session. The recommendation queue is the only sanctioned channel.

## Cross-reference

Spec: §4.7, §6.1.
