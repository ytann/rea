# Startup Product Intelligence Workflow — Design

Date: 2026-11-07
Status: Approved (design)

## Objective

Produce a scientific-method **Architecture & Product Teardown report** for a
startup's mobile application, so a job-seeker can hold a credible, founder-level
conversation: understand the product's features, its backend architecture, its
build-vs-buy decisions, and its scaling constraints — all from evidence the
client exposes plus public footprint, without any inside access.

The output is a **report**, not a pitch deck and not a codebase.

## Motivation

The user can already obtain APKs and statically analyze client binaries (REA's
JADX provider), but client binaries contain little direct backend logic. Full
dynamic HTTPS interception of a pinned mobile app is the _hardest, lowest-yield_
path to understanding. The higher-yield inputs, in order:

1. **Static APK analysis** — API endpoints, third-party SDKs, embedded GraphQL,
   feature surface (already available via REA).
2. **Public footprint / OSINT** — engineering job posts, funding/stage,
   engineering blogs, GitHub orgs, StackShare/BuiltWith.
3. **Best-effort dynamic traffic** — confirms domains and third-party SaaS,
   captures any cleartext/proxy-honoring traffic.

## Context: what REA already provides

REA already implements most of a naive "sandbox + HAR parser + prompt" spec,
and more correctly. Reuse it; do not reimplement:

| Need                                            | REA tool / provider                                                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HAR / mitmproxy / SAZ / qlog capture inspection | `inspect_web_network_capture` (`format: har\|mitmproxy\|saz\|qlog`), domain extraction, per-endpoint view, api-surface projection, redaction, evidence provenance |
| Static Android APK analysis                     | `inspect_android_package` (JADX): manifest, classes, references, resources                                                                                        |
| Device install/launch/logcat/screen             | adb family: `install_adb_package`, `start_adb_app`, `read_adb_logcat`, `capture_adb_screen`, `pull_adb_package`, etc.                                             |

The genuinely **missing** pieces, which this design adds:

1. **Automatic UI driving** — REA has no `monkey` / input injection.
2. **End-to-end orchestration** — REA deliberately neither starts nor manages
   emulators or proxies, and never installs them.

## Scope (Approach A)

Build only the missing glue as a **new skill + a standalone helper script**.
No changes to REA source, no new MCP provider, no new Python MCP server.

- **New skill**: `.agents/skills/rea-startup-intel/` — `SKILL.md` + references +
  scripts. Follows the existing `rea-*` skill conventions.
- **Helper script**: `.agents/skills/rea-startup-intel/scripts/capture-apk-traffic.sh`
  — best-effort dynamic traffic capture.

The skill reuses REA's existing MCP tools for static and traffic analysis, and
an **externally supplied** search/web MCP (brave-search or web fetch) for OSINT.
No search MCP is built; the skill degrades gracefully to web fetch if no search
tool is connected.

## Component 1 — `capture-apk-traffic.sh`

### Interface

Environment / arguments:

| Name                                        | Required | Default | Meaning                                               |
| ------------------------------------------- | -------- | ------- | ----------------------------------------------------- |
| `APK_PATH`                                  | yes      | —       | Absolute path to the target APK                       |
| `PACKAGE_NAME`                              | yes      | —       | Android package id (e.g. `com.acme.app`)              |
| `OUTPUT_DIR`                                | yes      | —       | Directory to receive `traffic.mitm` and `traffic.har` |
| `AVD_NAME`                                  | no       | —       | Boot this AVD; otherwise attach to the running device |
| `EVENT_COUNT`                               | no       | `500`   | Monkey pseudo-random UI events                        |
| `MITMDUMP_BIN` / `ADB_BIN` / `EMULATOR_BIN` | no       | `PATH`  | Override binary locations                             |

### Flow

1. **Preflight** — require `adb`, `mitmdump`, and a device (boot `AVD_NAME`
   or attach via `adb get-state`). Fail fast with remediation; **never install
   anything**.
2. **Start proxy** — background `mitmdump` on `127.0.0.1:8080`, emitting both
   native flow (`-w traffic.mitm`) and HAR (`--set hardump=traffic.har`). Wait
   for the port. (Note: `mitmdump -w` alone writes mitmproxy's flow format, not
   HAR; the `--set hardump=` addon is what produces a real HAR. This corrects
   the error in the user's original sketch.)
3. **Route device** — `adb reverse tcp:8080 tcp:8080` then
   `adb shell settings put global http_proxy 127.0.0.1:8080`.
4. **Install + drive** — `adb install -r`, then
   `adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER -v "$EVENT_COUNT"`
   under a timeout.
5. **Finalize** — unset proxy, remove reverse, SIGTERM mitmdump to finalize
   `traffic.mitm` + `traffic.har`. Report output paths and package id.

### Failure modes

- Missing prerequisite binary → exit non-zero with remediation text.
- No device / AVD boot failure → exit non-zero, no partial state left behind.
- Proxy port already bound → fail with the conflict, do not kill an unknown process.
- Cleanup always runs (trap on EXIT) so proxy/reverse/proxy-setting are removed
  even on failure; a failed capture retains whatever flow bytes were written.

## Component 2 — `rea-startup-intel` skill

Four phases, orchestrated by the agent:

### Phase 0 — Static (JADX)

`inspect_android_package` → endpoints, third-party SDKs, embedded GraphQL/keys,
manifest components, feature surface. Optional: apktool resource decoding.

### Phase 1 — Dynamic (best-effort)

Run `capture-apk-traffic.sh`, then `inspect_web_network_capture` on
`traffic.mitm` (`format: mitmproxy`) or `traffic.har` (`format: har`) → domains,
third-party SaaS, any captured bodies/schemas.

### Phase 2 — OSINT

Use available search/web tools → engineering job posts
(`site:lever.co` / `site:greenhouse.io` / `site:boards.greenhouse.io`),
funding/stage, engineering blog, GitHub org, StackShare/BuiltWith. Extract stack
signals.

### Phase 3 — Synthesis

Cross-reference phases 0–2 and emit the **report** (Component 3).

## Component 3 — Report template (output contract)

The skill's synthesis produces a markdown report with mermaid diagrams,
structured like a scientific paper and **MECE**:

1. **Abstract** — what the product is, core function, key architecture/stack.
2. **Objective & Motivation** — the question answered and why.
3. **Pre-requisites & Tools** — REA + JADX, adb + emulator + mitmproxy, search
   MCP; explicitly list what was/wasn't available.
4. **Method / Framework / Flow** — the four-phase pipeline with a mermaid flow
   diagram.
5. **Results** (MECE core):
   - **Product overview & positioning** — what/whom/scope.
   - **Feature inventory** — every feature grouped in a MECE taxonomy
     (onboarding / core loop / social / commerce / notifications / settings /
     admin / infra-adjacent), each with _what it does_.
   - **Client-side → server-side mapping** — per client artifact (endpoint,
     SDK, GraphQL query, config), what it reveals about the backend.
   - **Architecture (HLD)** — client → edge/CDN → API gateway → services →
     data stores, as mermaid.
   - **Third-party SaaS matrix** — build vs. buy, categorized.
   - **Inferred data model** — entities + relationships from JSON keys and
     GraphQL.
   - **How & why** — per major feature: likely implementation + engineering
     rationale (e.g. WebSocket vs polling, GraphQL for mobile).
   - **Scaling & risk observations** — bottlenecks, SPOFs, growth constraints.
6. **Limitations & unknowns** — unverifiable items (pinned HTTPS, etc.).
7. **Conclusion & recommendations** — architectural recommendations, no
   founder-pitch tone.

### Evidence discipline

Every claim in Results is tagged with its evidence class — `observation`
(directly seen), `derivation` (logically follows from observations),
`inference` (plausible but unconfirmed), `unknown`. This honors AGENTS.md's
requirement to never conflate a guess with a fact.

## Constraints

- **Bring-your-own binaries.** The script never installs emulator, system
  image, adb, mitmproxy, or any platform tools (aligns with AGENTS.md and REA's
  installer rules).
- **HTTPS is best-effort.** Full body decryption requires a rooted AVD with the
  mitmproxy CA as a system cert, plus certificate-pinning bypass (Frida) for
  most real apps. Documented as an optional add-on; out of v1. Static + OSINT
  carry the signal in v1.
- **No new REA provider.** Monkey driving and capture orchestration remain a
  workflow-level helper, not a first-class provider. Target execution/injection
  as an _integrated_ REA capability would need a maintainer scope decision per
  AGENTS.md; that is explicitly deferred.

## Non-goals

- No founder-pitch / sales framing.
- No custom Python HAR MCP (reuses `inspect_web_network_capture`).
- No certificate-pinning bypass or rooted-AVD automation in v1.
- No search/web MCP implementation.

## Testing

- **Script**: shellcheck-clean; a dry-run/`--help` self-check; unit-style tests
  for arg validation and the proxy-cleanup trap using a stub `mitmdump`.
- **Skill**: verify it loads (skill metadata), and that its commands reference
  existing REA tool names correctly.
- **Report template**: a golden example with a synthetic fixture verifying the
  section list and mermaid blocks render.

## Open decisions (defaults chosen)

- No search MCP is built; skill assumes one is connected and falls back to web
  fetch.
- `monkey` is the only UI driver in v1 (coordinate taps deferred).
