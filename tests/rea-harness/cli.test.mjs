import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { analyze } from "../../.agents/skills/rea-harness/scripts/rea-harness.mjs";
import { validateBundle } from "../../.agents/skills/rea-harness/scripts/lib/evidence.mjs";
import { probeEngines } from "../../.agents/skills/rea-harness/scripts/lib/readiness.mjs";

const CLI = fileURLToPath(
  new URL(
    "../../.agents/skills/rea-harness/scripts/rea-harness.mjs",
    import.meta.url,
  ),
);

const MZ = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64, 0x90)]);
const SQLITE = Buffer.concat([
  Buffer.from("SQLite format 3\x00"),
  Buffer.alloc(64, 0),
]);

const tempFile = (name, contents) => {
  const dir = mkdtempSync(join(tmpdir(), "rea-harness-cli-"));
  const path = join(dir, name);
  writeFileSync(path, contents);
  return { dir, path };
};

const runCli = (args) =>
  execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
  });

test("detect subcommand prints the descriptor JSON for an MZ file", () => {
  const { dir, path } = tempFile("app.exe", MZ);
  try {
    const out = JSON.parse(runCli(["detect", path]));
    assert.equal(out.kind, "file");
    assert.equal(out.format, "pe");
    assert.equal(out.suggested_provider, "ghidra");
    assert.ok(out.digest.length === 64);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readiness subcommand prints available/missing/versions", () => {
  const out = JSON.parse(runCli(["readiness"]));
  assert.ok(Array.isArray(out.available));
  assert.ok(Array.isArray(out.missing));
  assert.equal(typeof out.versions, "object");
});

test("analyze fails closed (exit 3) when a required engine is missing, still writing outputs", async () => {
  const { dir, path } = tempFile("app.exe", MZ);
  const outDir = join(dir, "out");
  try {
    const res = await analyze(path, { out: outDir, lookup: () => "" });
    assert.equal(res.exitCode, 3);
    assert.ok(res.readiness.missing.includes("ghidra"));

    const bundle = JSON.parse(
      readFileSync(join(outDir, "evidence.json"), "utf8"),
    );
    const vr = validateBundle(bundle);
    assert.equal(vr.ok, true, vr.errors.join("; "));
    assert.equal(bundle.target.format, "pe");
    assert.ok(
      bundle.run.commands.length > 0 &&
        bundle.run.commands.every((c) => c.startsWith("rea ")),
    );
    assert.ok(
      bundle.facts.some(
        (f) =>
          f.category === "detection" &&
          f.evidence_class === "obs" &&
          f.claim.includes("pe"),
      ),
    );
    assert.ok(
      bundle.facts.some(
        (f) =>
          f.category === "readiness" &&
          f.claim === "ghidra unavailable" &&
          f.evidence_class === "obs",
      ),
    );

    const report = readFileSync(join(outDir, "report.md"), "utf8");
    assert.ok(report.includes("ghidra"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyze exits 0 and writes outputs for a target with no required engines", async () => {
  const { dir, path } = tempFile("script.py", Buffer.from("print('hi')\n"));
  const outDir = join(dir, "out");
  try {
    const res = await analyze(path, { out: outDir, lookup: () => "" });
    assert.equal(res.exitCode, 0);
    assert.deepEqual(res.readiness.missing, []);

    const bundle = JSON.parse(
      readFileSync(join(outDir, "evidence.json"), "utf8"),
    );
    assert.equal(bundle.target.format, "py");
    assert.ok(bundle.run.commands.length > 0);
    assert.equal(bundle.facts.length, 1);
    assert.ok(readFileSync(join(outDir, "report.md"), "utf8").length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyze subprocess exits 0 for a sqlite target with real engine probing", () => {
  const { dir, path } = tempFile("data.db", SQLITE);
  const outDir = join(dir, "out");
  try {
    const out = runCli(["analyze", path, "--out", outDir]);
    assert.ok(out.includes("sqlite"));
    const bundle = JSON.parse(
      readFileSync(join(outDir, "evidence.json"), "utf8"),
    );
    assert.equal(bundle.target.format, "sqlite");
    assert.ok(readFileSync(join(outDir, "report.md"), "utf8").length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyze subprocess fails closed with exit 3 when ghidra is missing", async (t) => {
  const real = await probeEngines();
  if (real.available.includes("ghidra")) {
    t.skip("ghidra installed in this environment");
    return;
  }
  const { dir, path } = tempFile("app.exe", MZ);
  const outDir = join(dir, "out");
  try {
    assert.throws(
      () => runCli(["analyze", path, "--out", outDir]),
      (err) => {
        assert.equal(err.status, 3);
        assert.ok(err.stderr.includes("missing"));
        const bundle = JSON.parse(
          readFileSync(join(outDir, "evidence.json"), "utf8"),
        );
        assert.ok(bundle.facts.some((f) => f.category === "readiness"));
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyze --json prints the bundle to stdout", () => {
  const { dir, path } = tempFile("data.db", SQLITE);
  const outDir = join(dir, "out");
  try {
    const out = runCli(["analyze", path, "--out", outDir, "--json"]);
    const bundle = JSON.parse(out);
    assert.equal(bundle.schema_version, "1.0");
    assert.equal(bundle.target.format, "sqlite");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
