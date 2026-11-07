---
name: rea-startup-intel
description: Reverse engineer a startup's mobile product into a scientific-method Architecture & Product Teardown report for a founder-level conversation. Combines static APK analysis (JADX), best-effort dynamic traffic capture (mitmproxy + monkey), and OSINT. Use when the goal is product/backend understanding to pitch ideas, not source-level decompilation.
---

# REA Startup Product Intelligence

Produce a scientific-method report — Abstract → Objective/Motivation →
Pre-requisites/Tools → Method → Results (MECE) → Limitations → Conclusion —
giving a holistic view of a startup's mobile product: feature inventory,
client→server mapping, architecture (HLD), third-party SaaS, inferred data
model, and how/why each major feature is built.

Use this skill when the target is a startup's **product** — mobile app,
backend, and public footprint — and the goal is understanding to hold a
founder-level conversation. For source-level decompilation itself, use
`reverse-engineer-anything` instead.

## Prerequisites

- REA MCP tools available: `inspect_android_package`, `inspect_web_network_capture`, and the adb family.
- A search/web tool (brave-search or web fetch) for OSINT.
- For dynamic capture: caller-supplied `adb`, `mitmdump`, and an AVD/device. The script never installs them.

## Workflow

### Phase 0 — Static analysis (JADX)

Run `inspect_android_package` on the APK. Record: API endpoints, third-party
SDKs, embedded GraphQL/keys, manifest components, the feature surface, and the
**data-flow evidence** — manifest permissions, request/response field names, and
SDK telemetry (follow [data-flow-inventory](references/data-flow-inventory.md)).
Tag each finding `[obs]` (seen) or `[der]` (derived).

### Phase 1 — Dynamic capture (best-effort)

Run `scripts/capture-apk-traffic.sh --apk <path> --package <pkg> --output <dir>`.
Then `inspect_web_network_capture <dir>/traffic.mitm mitmproxy` (or
`<dir>/traffic.har har`) to extract domains, third-party SaaS, and any captured
bodies. Expect limited coverage: many apps pin certificates or ignore the
system proxy.

### Phase 2 — OSINT

Search `site:lever.co | site:greenhouse.io "<company>" engineer`, funding/stage
news, engineering blog, GitHub org, StackShare/BuiltWith. Extract stack signals.

### Phase 3 — Synthesis

Fill in [report-template](references/report-template.md). Complete the data-flow
inventory (5.4) and derive the HLD (5.5) from the flows. Tag every claim with
its evidence class (`[obs]`/`[der]`/`[inf]`/`[unk]`). Do not invent facts; mark
unconfirmed reasoning `[inf]` and unknowns `[unk]`.

## Output

A markdown report saved to the analysis directory, following the template.
