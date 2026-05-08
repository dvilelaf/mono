---
name: swe-rebench-v2-orient
description: Orient on a SWE-rebench v2 task — read the problem statement, repo, base commit, and auxiliary interface info; identify the test files in FAIL_TO_PASS; understand what change the issue requires.
---

# Orient on a SWE-rebench v2 task

Inputs you receive under `goal.spec` in the full task body:

- `goal.spec.instance_id` — e.g. `unidata__netcdf-c-1925`
- `goal.spec.repo` — `org/repo`
- `goal.spec.base_commit` — git SHA
- `goal.spec.language` — `python | javascript | typescript | go | c | cpp | cs | java | rust | dart`
- `goal.spec.problem_statement` — the issue description
- `goal.spec.interface` — auxiliary interface info (function names, signatures, descriptions). May be empty.

Steps:

1. Read the problem statement carefully. Note the symptom, the expected behaviour, and any hints about which files / symbols are involved.
2. If `task.interface` is non-empty, treat it as authoritative for function names + signatures of the API you must implement / fix.
3. Use the corpus (via `corpus.read({ kind: 'swe-rebench-v2.v1', similarTo: goal.spec.repo, ... })`) to read peer trajectories on similar repos / similar issue types. Note successful patterns; note what didn't work.
4. Check the `FAIL_TO_PASS` test names from the HF row — these define the success criterion. Find them in the codebase via grep / fs search.
5. Output a brief Orient summary (3-5 sentences): your hypothesis about the bug, the files you intend to touch, the test you intend to satisfy.

Pass this summary forward to the Plan phase.
