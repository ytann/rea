---
name: rea-harness
description: Detect any target (file, URL, or bytes) and route it to an REA provider workflow, gate on engine readiness, and emit a markdown report plus a machine-readable evidence bundle — without executing REA itself.
---

# REA Harness

A fail-closed harness around REA: detect a target's format → route it to a
provider workflow → check that the workflow's required engines are installed
→ emit a scientific-method markdown report and a machine-readable evidence
bundle. The harness plans REA workflows and gates them; it never executes REA
commands.

## Commands

Run from the repo root:

```sh
node .agents/skills/rea-harness/scripts/rea-harness.mjs detect /path/to/app.apk
# -> detection descriptor JSON: kind, format, confidence, digest, suggested provider, required engines

node .agents/skills/rea-harness/scripts/rea-harness.mjs readiness
# -> { available: [...], missing: [...], versions: {...} } for all known engines

node .agents/skills/rea-harness/scripts/rea-harness.mjs analyze /path/to/app.apk [--out DIR] [--json]
```

`analyze` runs detect → readiness probe → route → readiness check, then writes
`evidence.json` (the bundle) and `report.md` into `--out` (default
`./rea-harness-out/<basename>`). By default it prints a plan summary; with
`--json` it prints the bundle JSON to stdout instead.

## How an agent uses it

1. Run `analyze <target>`. Exit `0` means every engine the routed workflow
   needs is installed; exit `3` means some are missing (see the fail-closed
   contract below).
2. Execute each planned command in `evidence.json` → `run.commands` with REA
   (its MCP tools or the `rea` CLI), following `references/routing-table.md`
   for the per-format workflow. Do not execute REA through this harness.
3. Add each finding as a fact in the bundle's `facts[]` (`id`, `category`,
   `claim`, `evidence_class` of `obs|der|inf|unk`, `source`). Tag derived or
   inferred findings `der`/`inf`, never `obs`.
4. Regenerate the report from the updated bundle:

```sh
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { bundleToMarkdown } from '.agents/skills/rea-harness/scripts/lib/report.mjs';
const bundle = JSON.parse(readFileSync('rea-harness-out/<basename>/evidence.json', 'utf8'));
writeFileSync('rea-harness-out/<basename>/report.md', bundleToMarkdown(bundle));
"
```

## Fail-closed contract

Never run a workflow whose required engines are missing. `analyze` exits `3`,
lists the missing engines with their remediation hints (see
`scripts/lib/readiness.mjs` → `REMEDIATION`), and still writes the report and
bundle, tagging each missing required engine with a `readiness` fact. Resolve
the missing engines — or choose a target whose format needs none — before
running REA.
