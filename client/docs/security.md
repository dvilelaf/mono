# Security

Read this before running the daemon with third-party plug-ins or harnesses.

---

## Disclaimer

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
content forces re-approval.

This text is normative. See spec §3.1 for the authoritative form.

---

## Sandboxing the daemon

Run the daemon in an isolated environment. These are the three practical
approaches, in order of isolation strength:

### Fresh VM

Provision a dedicated VM (cloud or local). Install only what the daemon
needs. The daemon's process cannot reach personal files, credentials,
or production wallets on your primary machine.

Steps:
1. Provision a Linux VM (Ubuntu 22.04 LTS works well).
2. Install Node.js 22, Foundry, and Claude Code CLI on the VM.
3. Copy your config file to `~/.jinn-client/config.json` on the VM.
   Do **not** mount home directories or credential directories from
   the host.
4. Run `jinn run` on the VM only.

### Docker / devcontainer

Use a container with a minimal bind mount. The daemon needs only its
working directory.

```dockerfile
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /daemon
COPY . .
RUN npm install --production

CMD ["node", "dist/bin/jinn.js", "run"]
```

```bash
# Mount only the daemon's state directory. Do NOT mount ~/.ssh,
# ~/.aws, ~/.gnupg, or any directory containing production keys.
docker run \
  -v /path/to/daemon-state:/root/.jinn-client \
  -e JINN_PASSWORD="$(cat /path/to/password)" \
  jinn-daemon
```

What NOT to mount:
- `~/.ssh` — exposes SSH private keys
- `~/.aws`, `~/.gcp` — exposes cloud credentials
- `~/.gnupg` — exposes GPG keys
- Any directory containing wallet files, browser profiles, or API keys
  for services outside the daemon's purpose

### Dedicated user account

Create a system user for the daemon. The daemon runs under that account
and cannot read files owned by your primary user.

```bash
# Create a daemon user
sudo useradd -m -s /bin/bash jinn-daemon

# Install deps as that user
sudo -u jinn-daemon bash -c "cd ~ && nvm install 22"

# Run the daemon as that user
sudo -u jinn-daemon env JINN_PASSWORD=secret \
  node /opt/jinn/dist/bin/jinn.js run
```

Do not add `jinn-daemon` to groups that can read your primary user's
home directory.

---

## `followedAttestors[]` — populating your trust set

The default config ships with an empty `followedAttestors[]` list.
Discovery verbs (`jinn solver-plugins discover`, `jinn harnesses discover`)
return no results until you populate the list. This is intentional: the
protocol has no central authority publishing a starter set, and forcing
operators to choose who to follow is part of the security model.

**How to populate `followedAttestors[]`:**

1. **Word-of-mouth.** Ask peers in the Jinn community which attestor
   addresses they follow. Offline introductions are the primary bootstrap
   mechanism for v0.

2. **Observed cluster activity on ERC-8004.** Watch the ERC-8004 attestation
   events on-chain. Attestors who consistently publish `endorse` / `review`
   attestations for packages you already trust are candidates to follow.

3. **GitHub Discussions.** Jinn community members sometimes publish their
   attestor addresses in the [Discussions](https://github.com/Jinn-Network/mono/discussions)
   forum. Look for threads where operators share their followed-attestor lists.

4. **In-person introductions.** At ecosystem events, participants often
   exchange attestor addresses directly. Treat this the same as exchanging
   a PGP fingerprint.

**How to add an attestor:**

Add the address to `followedAttestors[]` in `~/.jinn-client/config.json`:

```json
{
  "followedAttestors": [
    "0xAttestorAddress1",
    "0xAttestorAddress2"
  ]
}
```

Or set the env var (comma-separated):

```bash
export JINN_FOLLOWED_ATTESTORS="0xAttestorAddress1,0xAttestorAddress2"
```

Once populated, `jinn solver-plugins discover` and `jinn harnesses discover`
will show packages attested by the operators you follow, ranked by net
positive signal.

See spec §10 for the deferred follow-up work on attestor bootstrapping.

---

## Privacy of `--publish` (installed attestations)

Publishing an `installed` attestation announces to the network that you
run a specific plug-in or harness. This can constitute competitive
intelligence — other operators (and plug-in authors) can infer your
strategy from the packages you publish.

**Guidance:**

- Publish install attestations for packages you want to make
  discoverable — if you want other operators to find a useful package
  through your endorsement, publishing your install helps.
- Do not publish for packages that constitute your competitive edge.
  If your alpha comes from a specific forecaster configuration, keep
  that private.

The default is opt-in: `--publish` must be passed explicitly, or you
must set `publishInstallAttestations: true` in config (which flips the
default to publish on every install). Unless you have a reason to publish
broadly, leave `publishInstallAttestations` unset and use `--publish`
selectively.

See spec §13.6 for the design rationale.

---

## Review-CID retention

When you run `jinn solver-plugins review` or `jinn harnesses review`,
the notes file is pinned to IPFS and the CID is embedded in the
on-chain attestation. The attestation is permanent; the CID is not.

If your pinning service (or the daemon's IPFS client) stops pinning
the CID, the review notes become unreachable even though the attestation
still exists on-chain. Reviewers are responsible for keeping their own
pin alive.

Practical steps:
- Use a pinning service (Pinata, web3.storage, or self-hosted IPFS)
  to keep review CIDs alive long-term.
- Record the CIDs of reviews you care about and verify periodically
  that they are still reachable.

Phase D shared caches will harden retention. Until then, pin manually.

See spec §13.3 for the design note.

---

## Cross-references

- spec §3.1 — disclaimer normative text
- spec §3.3 — Bash installer-refuse rule
- spec §6.3 — review-notes conventions
- spec §10 — deferred primitives and triggers (tier→reward-eligibility coupling)

---

## Operator validation steps (manual e2e)

To verify content-hash protection end-to-end:

1. Install a plug-in:
   ```bash
   jinn solver-plugins add ./examples/learner-plug-ins/@jinn-examples/calibration-refiner
   ```

2. Check the install record:
   ```bash
   cat ~/.jinn-client/installed-plug-ins.json
   ```
   Confirm `manifestHash`, `tarballHash`, and `entryPointHashes` are present.

3. Mutate a file in the installed plug-in:
   ```bash
   echo "MUTATED" >> examples/learner-plug-ins/@jinn-examples/calibration-refiner/skills/some-skill/SKILL.md
   ```

4. Trigger a load. The daemon (or the loader invoked directly in a test)
   should emit an error containing `content-hash-mismatch` and refuse to
   load the plug-in.

This confirms that the content-hash binding prevents silent drift between
the approved package and what runs in the daemon.
