# SolverPlugin quickstart (Path 1)

A walkthrough for shipping a SolverPlugin — AI tooling that augments the
bundled `claude-code-learner` Harness with extra MCP servers, skills,
prompts, or local docs.

Use a SolverPlugin when you have reusable substrate for the learner:

- Claude Code or Gemini extension manifests
- MCP servers
- skills or prompts
- local docs or examples

Use a Harness package (Path 2) instead when you own the full `run(ctx)`
implementation and want to replace or supplement the bundled executor.

---

## Security

Before installing any third-party plug-in or harness, read [security.md](../security.md). Key points:

- Run the daemon in an isolated environment (VM / devcontainer / dedicated user account).
- Third-party plug-ins and harnesses run with the daemon's full capabilities.
- Jinn does not audit third-party code — operator vigilance is required.
- The learner does not autonomously install; recommendations land in `~/.jinn-client/recommendations.jsonl` for your explicit review.

The full disclaimer is at [security.md](../security.md).

---

## Layout

```text
@yourname/your-plugin/
├── jinn.plugin.json
├── .claude-plugin/
│   └── plugin.json
├── gemini-extension.json
├── .mcp.json
├── mcp/
│   └── server.mjs
├── skills/
│   └── useful-skill/
│       └── SKILL.md
└── README.md
```

## Jinn manifest

```json
{
  "name": "@yourname/your-plugin",
  "version": "0.1.0",
  "description": "Optional tools and skills for a SolverNet.",
  "jinn": {
    "supports": ["prediction.v1"],
    "mcpServers": {
      "example": {
        "command": "node",
        "args": ["mcp/server.mjs"]
      }
    },
    "skills": ["skills/useful-skill"]
  }
}
```

`jinn.supports` is compatibility metadata only. SolverNet contracts in
`@jinn-network/sdk/solvernets` define schemas, credential requirements,
evaluation functions, and aggregation functions.

## Install

```bash
jinn solver-plugins add ./path/to/@yourname/your-plugin
```

The client validates the manifest, records a content-hash binding, and
loads the plug-in through the relevant host runtime. Harness dispatch is
unchanged: only Harness packages implement `run(ctx)`.

---

## Discovery, feedback, and revocation

Once installed, you can:

- `jinn solver-plugins recommendations` — review what the learner suggests installing
- `jinn solver-plugins discover` — list plug-ins endorsed by attestors you follow
- `jinn solver-plugins endorse @yourname/your-plugin` — publish an attestation backing the package
- `jinn solver-plugins warn @yourname/your-plugin --reason "..."` / `block @yourname/your-plugin --reason "..."` — flag a package
- `jinn solver-plugins review @yourname/your-plugin --notes-file review.md` — pin a code review to IPFS and publish attestation
- `jinn solver-plugins status` — cross-check installed plug-ins against followed-attestor advisories

See [security.md — followedAttestors guidance](../security.md#followedattestors--populating-your-trust-set) for how to populate your followed-attestor set (default: empty).
