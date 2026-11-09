# REA Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A layered "reverse-engineering swiss knife" harness _around_ REA: detect any target → route to the right REA workflow → gather evidence → emit a scientific-method report, a machine-readable evidence bundle, and Manim animations (components in isolation + overall flow).

**Architecture:** Six components built dependency-first. The **evidence bundle schema** is the shared contract (C, D, E consume it). Detection + routing (A) and readiness (F) are independent of the bundle and can be built in parallel once their output shapes are pinned. Report (C), animation (D), and CLI+skill (E) layer on top.

**Tech Stack:** Node ESM (`.mjs`, no build step) for the harness core/CLI (matches the repo's `scripts/*.mjs` convention and avoids the turbo build); Python 3.13 + Manim for animation; markdown/mermaid for the report; JSON Schema for the evidence bundle.

---

## File layout (contract — do not deviate)

```
.agents/skills/rea-harness/
  SKILL.md                          # component E (skill surface)
  references/
    routing-table.md                # component A: format -> workflow mapping (human-readable)
    report-template.md              # component C: generalized report template
    animation-spec.md               # component D: what to animate + how to feed it
  scripts/
    lib/
      target.mjs                    # component A: descriptor type + detect() + route()
      evidence-schema.json          # component B: the evidence bundle JSON Schema
      evidence.mjs                  # component B: create/validate/normalize the bundle
      readiness.mjs                 # component F: probe engines, fail-closed
      report.mjs                    # component C: bundle -> markdown report
    animate/
      render.py                     # component D: Manim entry (bundle -> videos)
      scenes/
        component.py                # component D: per-component animation
        process_flow.py             # component D: overall flow animation
    rea-harness.mjs                 # component E: CLI entry
tests/rea-harness/
  target.test.mjs                   # A
  evidence.test.mjs                 # B
  readiness.test.mjs                # F
  report.test.mjs                   # C
  cli.test.mjs                      # E
```

Everything lives inside the REA repo under `.agents/skills/rea-harness/` (skill + CLI share one tree). The CLI is invoked as `node .agents/skills/rea-harness/scripts/rea-harness.mjs ...`.

---

## Shared contracts (pinned here — the whole point of this plan)

### Target descriptor (component A output)

```js
{
  kind: "url" | "file" | "bytes",
  format: "apk" | "ipa" | "web" | "deb" | "exe" | "elf" | "macho" | "pe" | "js"
        | "py" | "go" | "rust" | "dotnet" | "firmware" | "pcap" | "sqlite" | "unknown",
  source: string,            // original path/url
  digest: string,            // sha256 hex, "" if not computable
  confidence: number,        // 0..1
  suggested_provider: string,// e.g. "jadx" | "browser" | "ghidra" | ...
  required_engines: string[] // e.g. ["jadx"] | ["mitmdump","adb"] | []
}
```

### Evidence bundle (component B — JSON Schema `evidence-schema.json`)

```json
{
  "schema_version": "1.0",
  "target": { "kind": "file", "format": "apk", "source": "/abs/x.apk", "digest": "abc", "confidence": 0.95 },
  "readiness": { "available": ["jadx"], "missing": ["ghidra"] },
  "run": { "started_at": "ISO", "completed_at": "ISO", "commands": ["rea inspect-android-package ..."] },
  "facts":    [ { "id": "f1", "category": "permission", "claim": "ACCESS_FINE_LOCATION", "evidence_class": "obs", "source": "manifest" } ],
  "flows":    { "upstream": [ ... ], "downstream": [ ... ], "telemetry": [ ... ] },
  "systems":  [ { "id": "s1", "name": "Identity", "justification": "auth tokens", "evidence_class": "der" } ],
  "artifacts":[ { "kind": "report", "path": "/abs/report.md" } ]
}
```

`evidence_class` is always one of `obs | der | inf | unk`. `flows` and `systems` may be empty arrays for targets where data-flow/HLD does not apply (e.g. a native binary's "systems" are functions/imports instead).

### Routing table (component A) — `references/routing-table.md`

| format           | provider     | workflow (REA commands)                                                               | required_engines      |
| ---------------- | ------------ | ------------------------------------------------------------------------------------- | --------------------- |
| apk              | jadx         | `inspect-android-package`, optional `inspect-apk-signature`, `capture-apk-traffic.sh` | jadx, (adb, mitmdump) |
| ipa              | jadx/objdump | `inspect-*` (apple)                                                                   | —                     |
| web / url        | browser      | `observe-web-execution`, `inspect-web-network-capture`                                | browser               |
| deb/rpm          | filesystem   | `extract-artifact`, `inspect-artifact`                                                | binwalk               |
| exe/elf/macho/pe | native       | `open_binary` -> ghidra/ida/hopper/kuna/rizin/objdump                                 | ghidra*               |
| pcap             | tshark       | `inspect-packet-capture`                                                              | tshark                |
| sqlite           | sqlite       | `inspect-sqlite-database`                                                             | —                     |

The exact commands are filled by the A subagent from `docs/` and `src/cliCommandNames.ts`; the _shape_ above is the contract.

### CLI interface (component E)

```
node rea-harness.mjs detect <target>        # -> descriptor JSON
node rea-harness.mjs readiness               # -> engine availability JSON
node rea-harness.mjs analyze <target> [--out DIR] [--animate] [--json]
  # pipeline: detect -> readiness -> route -> run REA -> bundle -> report -> (animate)
```

---

## Tasks (build in this order; waves marked)

### Wave 1 — foundation (parallel-safe; contracts pinned above)

**Task A — Detection & routing.** Create `scripts/lib/target.mjs` + `references/routing-table.md`. `detect(target)` must distinguish url vs file vs bytes, then classify format via extension + `file` magic + content sniffing (APK = `META-INF/MANIFEST.MF` in zip; PE = `MZ`; ELF = `\x7fELF`; Mach-O magic; sqlite header; pcap magic). `route(format)` returns `{ provider, workflow, required_engines }`. TDD with `tests/rea-harness/target.test.mjs` using fixture byte-prefixes (no real files needed).

**Task B — Evidence bundle.** Create `scripts/lib/evidence-schema.json` (JSON Schema, draft 2020-12) + `scripts/lib/evidence.mjs` (`createBundle`, `validateBundle`, `addFact`, `addSystem`). TDD with `tests/rea-harness/evidence.test.mjs`: a valid bundle passes, a bundle with a bad `evidence_class` or missing `schema_version` fails.

**Task F — Readiness.** Create `scripts/lib/readiness.mjs`: probe each known engine (`ghidra`, `ida`, `hopper`, `kuna`, `jadx`, `apktool`, `mitmdump`, `adb`, `objdump`, `tshark`, `python3`, `ffmpeg`, `manim`) via `command -v` + version probe where cheap. Return `{ available, missing, versions }`. Fail-closed: `analyze` refuses a workflow whose `required_engines` intersect `missing`, with remediation text. TDD with `tests/rea-harness/readiness.test.mjs` stubbing `command -v`.

### Wave 2 — report (depends on B)

**Task C — Report generator.** Generalize `rea-startup-intel`'s template into `references/report-template.md` (format-agnostic sections: Abstract / Objective / Method / Results / Limitations / Conclusion, with a per-format facet list). Create `scripts/lib/report.mjs`: `bundleToMarkdown(bundle, target)` renders the report, pulling facts/systems/flows from the bundle. TDD with `tests/rea-harness/report.test.mjs`: a fixture bundle renders markdown containing each section heading and the facts.

### Wave 3 — animation (depends on B; spike first)

**Task D — Animation.** Requires `pip install manim` + ffmpeg (note in plan; not installed here). Create `scripts/animate/render.py` (reads a bundle JSON, dispatches to scenes) + `scenes/component.py` (one animated diagram per `system`) + `scenes/process_flow.py` (animated overall flow from `systems` + `flows`). Start with a **spike**: render one hardcoded process-flow video to prove Manim+ffmpeg work before generalizing. Acceptance: `render.py --bundle evidence.json --out out/` produces `.mp4` files.

### Wave 4 — CLI + skill (depends on A, B, C, F)

**Task E — CLI + skill.** Create `scripts/rea-harness.mjs` implementing `detect`/`readiness`/`analyze` per the interface above (analyze chains A→F→route→B→C→optional D), and `SKILL.md` describing how an agent drives it. TDD with `tests/rea-harness/cli.test.mjs` (arg parsing + `detect`/`readiness` subcommands on fixtures).

---

## Self-review notes

- **Contract-first:** A, B, F are the only Wave-1 tasks and their output shapes are pinned above, so they can run in parallel without divergence.
- **Dependency waves:** C after B; D after B; E after A+B+C+F. Do not dispatch D before the Manim/ffmpeg spike succeeds.
- **Feasibility gap:** ffmpeg + manim are not installed; Task D must `pip install manim` + install ffmpeg (or be marked blocked until the user provides them).
- **Readiness is real:** zero engines installed today, so `analyze` will mostly fail-closed with remediation until engines land — that is correct behavior, not a bug.
