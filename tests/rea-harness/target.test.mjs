import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  detect,
  route,
} from "../../.agents/skills/rea-harness/scripts/lib/target.mjs";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const MZ = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64, 0x90)]);
const ELF = Buffer.concat([
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
  Buffer.alloc(60, 0),
]);
const SQLITE = Buffer.concat([
  Buffer.from("SQLite format 3\x00"),
  Buffer.alloc(64, 0),
]);
const PCAP = Buffer.concat([
  Buffer.from([0xd4, 0xc3, 0xb2, 0xa1]),
  Buffer.alloc(20, 0),
]);
const WASM = Buffer.concat([
  Buffer.from([0x00, 0x61, 0x73, 0x6d]),
  Buffer.alloc(12, 0),
]);
const APK_ZIP = Buffer.concat([
  Buffer.from("PK\x03\x04"),
  Buffer.alloc(8, 0),
  Buffer.from("META-INF/MANIFEST.MF"),
  Buffer.alloc(4, 0),
  Buffer.from("AndroidManifest.xml"),
]);

test("url string routes to web/browser", () => {
  const d = detect("https://example.com/app");
  assert.equal(d.kind, "url");
  assert.equal(d.format, "web");
  assert.equal(d.suggested_provider, "browser");
  assert.deepEqual(d.required_engines, []);
  assert.equal(d.confidence, 0.9);
  assert.equal(d.digest, "");
});

test("MZ bytes detect as pe/ghidra", () => {
  const d = detect(MZ);
  assert.equal(d.kind, "bytes");
  assert.equal(d.format, "pe");
  assert.equal(d.suggested_provider, "ghidra");
  assert.deepEqual(d.required_engines, ["ghidra"]);
  assert.equal(d.digest, sha256(MZ));
});

test("ELF bytes detect as elf/ghidra", () => {
  const d = detect(ELF);
  assert.equal(d.kind, "bytes");
  assert.equal(d.format, "elf");
  assert.equal(d.suggested_provider, "ghidra");
  assert.deepEqual(d.required_engines, ["ghidra"]);
});

test("SQLite magic detects as sqlite", () => {
  const d = detect(SQLITE);
  assert.equal(d.kind, "bytes");
  assert.equal(d.format, "sqlite");
  assert.equal(d.suggested_provider, "sqlite");
  assert.deepEqual(d.required_engines, []);
});

test("little-endian pcap magic detects as pcap/tshark", () => {
  const d = detect(PCAP);
  assert.equal(d.kind, "bytes");
  assert.equal(d.format, "pcap");
  assert.equal(d.suggested_provider, "tshark");
  assert.deepEqual(d.required_engines, ["tshark"]);
});

test("wasm magic maps to js/browser", () => {
  const d = detect(WASM);
  assert.equal(d.kind, "bytes");
  assert.equal(d.format, "js");
  assert.equal(d.suggested_provider, "browser");
  assert.deepEqual(d.required_engines, []);
});

test("zip buffer containing META-INF/MANIFEST.MF detects as apk/jadx", () => {
  const d = detect(APK_ZIP);
  assert.equal(d.kind, "bytes");
  assert.equal(d.format, "apk");
  assert.equal(d.suggested_provider, "jadx");
  assert.deepEqual(d.required_engines, ["jadx"]);
});

test("plain Uint8Array without magic is unknown", () => {
  const d = detect(new Uint8Array([1, 2, 3, 4, 5]));
  assert.equal(d.kind, "bytes");
  assert.equal(d.format, "unknown");
  assert.equal(d.suggested_provider, "filesystem");
  assert.deepEqual(d.required_engines, []);
  assert.equal(d.confidence, 0.1);
});

test("readable file path sniffs magic and digests contents", () => {
  const dir = mkdtempSync(join(tmpdir(), "rea-harness-"));
  try {
    const path = join(dir, "app.bin");
    writeFileSync(path, ELF);
    const d = detect(path);
    assert.equal(d.kind, "file");
    assert.equal(d.format, "elf");
    assert.equal(d.digest, sha256(ELF));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("extension fallback for .deb, .js, .py", () => {
  const dir = mkdtempSync(join(tmpdir(), "rea-harness-"));
  try {
    const cases = [
      ["pkg.deb", "deb"],
      ["app.js", "js"],
      ["script.py", "py"],
    ];
    for (const [name, format] of cases) {
      const path = join(dir, name);
      const contents = Buffer.from(`hello ${name}`);
      writeFileSync(path, contents);
      const d = detect(path);
      assert.equal(d.kind, "file");
      assert.equal(d.format, format, `format for ${name}`);
      assert.equal(d.digest, sha256(contents), `digest for ${name}`);
      assert.ok(d.confidence < 0.9, `fallback confidence for ${name}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unreadable path is still kind file with unknown format", () => {
  const d = detect(join(tmpdir(), "does-not-exist-anywhere.bin"));
  assert.equal(d.kind, "file");
  assert.equal(d.format, "unknown");
  assert.equal(d.suggested_provider, "filesystem");
  assert.equal(d.confidence, 0.1);
  assert.equal(d.digest, "");
});

test("route(apk) returns jadx with non-empty workflow", () => {
  const r = route("apk");
  assert.equal(r.provider, "jadx");
  assert.ok(Array.isArray(r.workflow) && r.workflow.length > 0);
  assert.ok(r.required_engines.includes("jadx"));
});

test("route(unknown) falls back to filesystem", () => {
  const r = route("unknown");
  assert.equal(r.provider, "filesystem");
  assert.deepEqual(r.required_engines, []);
  assert.ok(Array.isArray(r.workflow));
});
