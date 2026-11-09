import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createBundle,
  addFact,
  addSystem,
} from "../../.agents/skills/rea-harness/scripts/lib/evidence.mjs";
import { bundleToMarkdown } from "../../.agents/skills/rea-harness/scripts/lib/report.mjs";

const TARGET = {
  kind: "file",
  format: "apk",
  source: "/abs/x.apk",
  digest: "abc123",
  confidence: 0.95,
};

const READINESS = { available: ["jadx"], missing: ["ghidra"] };

const FACTS = {
  f1: {
    id: "f1",
    category: "permission",
    claim: "ACCESS_FINE_LOCATION requested",
    evidence_class: "obs",
    source: "manifest",
  },
  f2: {
    id: "f2",
    category: "network",
    claim: "POST /v1/auth sends|receives tokens",
    evidence_class: "obs",
    source: "capture",
  },
  f3: {
    id: "f3",
    category: "network",
    claim: "server retains auth tokens",
    evidence_class: "inf",
    source: "capture",
  },
  f4: {
    id: "f4",
    category: "data model",
    claim: "exact store choice",
    evidence_class: "unk",
    source: "n/a",
  },
};

const SYSTEMS = {
  s1: {
    id: "s1",
    name: "Identity Service",
    justification: "auth token issuance",
    evidence_class: "der",
  },
  s2: {
    id: "s2",
    name: "Catalog Service",
    justification: "product listing payloads",
    evidence_class: "der",
  },
};

function fixtureBundle() {
  const b = createBundle({ ...TARGET }, { ...READINESS });
  b.run.commands = [
    "rea inspect-android-package /abs/x.apk",
    "rea decompile /abs/x.apk",
  ];
  for (const f of Object.values(FACTS)) addFact(b, { ...f });
  for (const s of Object.values(SYSTEMS)) addSystem(b, { ...s });
  b.flows.upstream = [
    { endpoint: "POST /v1/auth", payload: "device_id, phone, OTP" },
  ];
  b.flows.downstream = [
    { endpoint: "GET /v1/catalog", payload: "widget tree" },
  ];
  b.artifacts = [{ kind: "report", path: "/abs/report.md" }];
  return b;
}

const SECTION_HEADINGS = [
  "## 1. Abstract",
  "## 2. Objective & Motivation",
  "## 3. Pre-requisites & Tools",
  "## 4. Method / Framework / Flow",
  "## 5. Results",
  "### 5.1 Facts",
  "### 5.4 Artifacts",
  "## 6. Limitations & unknowns",
  "## 7. Conclusion & recommendations",
];

const occurrences = (text, needle) => text.split(needle).length - 1;

test("renders the title and every fixed section heading", () => {
  const out = bundleToMarkdown(fixtureBundle());
  assert.ok(out.includes(`# ${TARGET.source} — Reverse Engineering Report`));
  for (const h of SECTION_HEADINGS) {
    assert.ok(out.includes(h), `missing heading: ${h}`);
  }
});

test("renders the evidence-tag legend", () => {
  const out = bundleToMarkdown(fixtureBundle());
  for (const tag of ["[obs]", "[der]", "[inf]", "[unk]"]) {
    assert.ok(out.includes(tag), `missing legend tag: ${tag}`);
  }
});

test("renders every fact claim exactly once in the facts table", () => {
  const out = bundleToMarkdown(fixtureBundle());
  const tableStart = out.indexOf("### 5.1 Facts");
  const tableEnd = out.indexOf("### ", tableStart + 1);
  const table = out.slice(tableStart, tableEnd);
  for (const f of Object.values(FACTS)) {
    const escaped = f.claim.replace(/\|/g, "\\|");
    assert.equal(
      occurrences(table, escaped),
      1,
      `claim ${f.id} not rendered exactly once in 5.1`,
    );
  }
});

test("renders every system name exactly once in the 5.2 flowchart", () => {
  const out = bundleToMarkdown(fixtureBundle());
  assert.ok(out.includes("flowchart TD"));
  for (const s of Object.values(SYSTEMS)) {
    assert.equal(
      occurrences(out, s.name),
      1,
      `system ${s.id} not rendered exactly once`,
    );
  }
});

test("omits 5.2 entirely when systems is empty", () => {
  const b = fixtureBundle();
  b.systems = [];
  const out = bundleToMarkdown(b);
  assert.ok(!out.includes("### 5.2"));
  assert.ok(!out.includes("flowchart TD"));
});

test("renders only non-empty flow tables", () => {
  const out = bundleToMarkdown(fixtureBundle());
  assert.ok(out.includes("### 5.3 Data flows"));
  assert.ok(out.includes("#### Upstream"));
  assert.ok(out.includes("#### Downstream"));
  assert.ok(!out.includes("#### Telemetry"));

  const b = fixtureBundle();
  b.flows = { upstream: [], downstream: [], telemetry: [] };
  const empty = bundleToMarkdown(b);
  assert.ok(!empty.includes("### 5.3"));
  assert.ok(!empty.includes("#### Upstream"));
});

test("lists inf and unk facts under section 6", () => {
  const out = bundleToMarkdown(fixtureBundle());
  const start = out.indexOf("## 6. Limitations & unknowns");
  const end = out.indexOf("## 7. Conclusion & recommendations");
  const section = out.slice(start, end);
  assert.ok(section.includes(FACTS.f3.claim));
  assert.ok(section.includes(FACTS.f4.claim));
  assert.ok(!section.includes(FACTS.f1.claim));
  assert.ok(!section.includes(FACTS.f2.claim.replace(/\|/g, "\\|")));
});

test("escapes pipe characters in table cells", () => {
  const out = bundleToMarkdown(fixtureBundle());
  assert.ok(out.includes("sends\\|receives"));
  assert.ok(!out.includes("sends|receives"));
});

test("renders artifacts as a list", () => {
  const out = bundleToMarkdown(fixtureBundle());
  assert.ok(out.includes("report"));
  assert.ok(out.includes("/abs/report.md"));
});

test("output is deterministic", () => {
  const a = bundleToMarkdown(fixtureBundle());
  const b = bundleToMarkdown(fixtureBundle());
  assert.equal(a, b);
});
