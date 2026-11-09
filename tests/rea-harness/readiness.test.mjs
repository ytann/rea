import { test } from "node:test";
import assert from "node:assert/strict";

import {
  KNOWN_ENGINES,
  probeEngines,
  checkReadiness,
  REMEDIATION,
} from "../../.agents/skills/rea-harness/scripts/lib/readiness.mjs";

const names = KNOWN_ENGINES.map((entry) => entry.name);

const stubLookup = (present) => (name) => present[name] ?? "";

test("probeEngines reports availability from an injected lookup", async () => {
  const lookup = stubLookup({
    jadx: "/opt/jadx/bin/jadx",
    node: "/usr/bin/node",
  });
  const result = await probeEngines(lookup);
  assert.deepEqual(result.available, ["jadx", "node"]);
  assert.deepEqual(
    result.missing,
    names.filter((n) => n !== "jadx" && n !== "node"),
  );
  assert.equal(result.missing.length, names.length - 2);
});

test("probeEngines populates versions only for probeable engines", async () => {
  const lookup = stubLookup({
    jadx: "/opt/jadx/bin/jadx",
    node: "/usr/bin/node",
  });
  const result = await probeEngines(lookup);
  assert.deepEqual(result.versions, {
    jadx: "/opt/jadx/bin/jadx",
    node: "/usr/bin/node",
  });
});

test("available non-probeable engines get no version entry", async () => {
  const lookup = stubLookup({
    ghidra: "/opt/ghidra/support/analyzeHeadless",
    jadx: "/opt/jadx/bin/jadx",
  });
  const result = await probeEngines(lookup);
  assert.ok(result.available.includes("ghidra"));
  assert.deepEqual(Object.keys(result.versions), ["jadx"]);
});

test("empty lookup reports every engine missing", async () => {
  const result = await probeEngines(stubLookup({}));
  assert.deepEqual(result.available, []);
  assert.deepEqual(result.missing, names);
  assert.deepEqual(result.versions, {});
});

test("checkReadiness passes when every required engine is available", () => {
  assert.deepEqual(checkReadiness(["jadx"], { available: ["jadx"] }), {
    ok: true,
    missing: [],
  });
});

test("checkReadiness fails closed on the first missing engine", () => {
  assert.deepEqual(
    checkReadiness(["ghidra", "jadx"], { available: ["jadx"] }),
    {
      ok: false,
      missing: ["ghidra"],
    },
  );
});

test("checkReadiness with no requirements is always ok", () => {
  assert.deepEqual(checkReadiness([], { available: [] }), {
    ok: true,
    missing: [],
  });
});

test("checkReadiness is independent of extra available engines", () => {
  assert.deepEqual(
    checkReadiness(["node"], { available: ["ghidra", "node", "python3"] }),
    { ok: true, missing: [] },
  );
});

test("REMEDIATION has a one-line hint for every known engine", () => {
  for (const name of names) {
    assert.ok(
      typeof REMEDIATION[name] === "string" && REMEDIATION[name].length > 0,
      `missing remediation for ${name}`,
    );
  }
});
