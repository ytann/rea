import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createBundle,
  addFact,
  addSystem,
  validateBundle,
  normalizeBundle,
} from "../../.agents/skills/rea-harness/scripts/lib/evidence.mjs";

const TARGET = {
  kind: "file",
  format: "apk",
  source: "/abs/x.apk",
  digest: "abc123",
  confidence: 0.95,
};

const READINESS = { available: ["jadx"], missing: ["ghidra"] };

const validBundle = () => ({
  schema_version: "1.0",
  target: { ...TARGET },
  readiness: { ...READINESS },
  run: {
    started_at: "2026-11-07T00:00:00Z",
    completed_at: "2026-11-07T00:01:00Z",
    commands: ["rea inspect-android-package /abs/x.apk"],
  },
  facts: [
    {
      id: "f1",
      category: "permission",
      claim: "ACCESS_FINE_LOCATION requested",
      evidence_class: "obs",
      source: "manifest",
    },
  ],
  flows: { upstream: [], downstream: [], telemetry: [] },
  systems: [
    {
      id: "s1",
      name: "Identity",
      justification: "auth token issuance",
      evidence_class: "der",
    },
  ],
  artifacts: [{ kind: "report", path: "/abs/report.md" }],
});

test("createBundle returns a 1.0 bundle with empty arrays", () => {
  const b = createBundle({ ...TARGET }, { ...READINESS });
  assert.equal(b.schema_version, "1.0");
  assert.deepEqual(b.facts, []);
  assert.deepEqual(b.systems, []);
  assert.deepEqual(b.artifacts, []);
  assert.deepEqual(b.flows, { upstream: [], downstream: [], telemetry: [] });
  assert.ok(b.run.started_at);
});

test("validateBundle accepts the contract example", () => {
  const r = validateBundle(validBundle());
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test("validateBundle rejects a bad evidence_class", () => {
  const b = validBundle();
  b.facts[0].evidence_class = "maybe";
  const r = validateBundle(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
});

test("validateBundle rejects a bundle missing schema_version", () => {
  const b = validBundle();
  delete b.schema_version;
  const r = validateBundle(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
});

test("validateBundle rejects a fact missing id", () => {
  const b = validBundle();
  delete b.facts[0].id;
  const r = validateBundle(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
});

test("addFact pushes valid facts and throws on invalid evidence_class", () => {
  const b = createBundle({ ...TARGET }, { ...READINESS });
  addFact(b, {
    id: "f2",
    category: "permission",
    claim: "INTERNET requested",
    evidence_class: "inf",
    source: "manifest",
  });
  assert.equal(b.facts.length, 1);
  assert.throws(
    () =>
      addFact(b, {
        id: "f3",
        category: "permission",
        claim: "x",
        evidence_class: "maybe",
        source: "manifest",
      }),
    /evidence_class/,
  );
  assert.equal(b.facts.length, 1);
});

test("addSystem pushes valid systems and throws on invalid evidence_class", () => {
  const b = createBundle({ ...TARGET }, { ...READINESS });
  addSystem(b, {
    id: "s2",
    name: "Storage",
    justification: "writes user files",
    evidence_class: "unk",
  });
  assert.equal(b.systems.length, 1);
  assert.throws(
    () =>
      addSystem(b, {
        id: "s3",
        name: "X",
        justification: "y",
        evidence_class: "nope",
      }),
    /evidence_class/,
  );
  assert.equal(b.systems.length, 1);
});

test("normalizeBundle throws on a missing schema_version", () => {
  assert.throws(() => normalizeBundle({}), /schema_version/);
  assert.throws(() => normalizeBundle(null), /schema_version/);
});

test("normalizeBundle fills missing pieces and returns the canonical shape", () => {
  const n = normalizeBundle({ schema_version: "1.0" });
  assert.equal(n.schema_version, "1.0");
  assert.deepEqual(n.facts, []);
  assert.deepEqual(n.systems, []);
  assert.deepEqual(n.artifacts, []);
  assert.deepEqual(n.flows, { upstream: [], downstream: [], telemetry: [] });
});
