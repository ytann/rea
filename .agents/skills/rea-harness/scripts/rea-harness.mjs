import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { detect, route } from "./lib/target.mjs";
import { createBundle, addFact } from "./lib/evidence.mjs";
import { probeEngines, checkReadiness, REMEDIATION } from "./lib/readiness.mjs";
import { bundleToMarkdown } from "./lib/report.mjs";

export async function analyze(target, opts = {}) {
  const descriptor = detect(target);
  const availability = await probeEngines(opts.lookup);
  const plan = route(descriptor.format);
  const readiness = checkReadiness(plan.required_engines, availability);
  const outDir = opts.out ?? join("rea-harness-out", basename(target));

  const bundle = createBundle(descriptor, availability);
  bundle.run.commands = plan.workflow.map((command) => `rea ${command}`);
  const source = descriptor.source || target;
  addFact(bundle, {
    id: "f1",
    category: "detection",
    claim: `format ${descriptor.format} (confidence ${descriptor.confidence})`,
    evidence_class: "obs",
    source,
  });
  readiness.missing.forEach((name, i) =>
    addFact(bundle, {
      id: `f${i + 2}`,
      category: "readiness",
      claim: `${name} unavailable`,
      evidence_class: "obs",
      source,
    }),
  );
  bundle.run.completed_at = new Date().toISOString();

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "evidence.json"),
    `${JSON.stringify(bundle, null, 2)}\n`,
  );
  writeFileSync(join(outDir, "report.md"), `${bundleToMarkdown(bundle)}\n`);

  return {
    bundle,
    plan,
    readiness,
    outDir,
    exitCode: readiness.missing.length > 0 ? 3 : 0,
  };
}

const USAGE = [
  "usage:",
  "  node rea-harness.mjs detect <target>",
  "  node rea-harness.mjs readiness",
  "  node rea-harness.mjs analyze <target> [--out DIR] [--json]",
].join("\n");

const failClosedMessage = ({ readiness, outDir }) =>
  [
    `rea-harness: fail-closed - required engine(s) missing: ${readiness.missing.join(", ")}`,
    ...readiness.missing.map(
      (name) => `  ${name}: ${REMEDIATION[name] ?? "no remediation hint"}`,
    ),
    "the planned workflow was NOT executed; it is recorded in the evidence bundle:",
    `  evidence: ${join(outDir, "evidence.json")}`,
    `  report:   ${join(outDir, "report.md")}`,
  ].join("\n");

const planSummary = ({ bundle, plan, readiness, outDir }) =>
  [
    `target:     ${bundle.target.source}`,
    `format:     ${bundle.target.format} (confidence ${bundle.target.confidence})`,
    `provider:   ${plan.provider}`,
    `workflow:   ${bundle.run.commands.join(" -> ")}`,
    `readiness:  ${readiness.missing.length === 0 ? "all required engines available" : `missing ${readiness.missing.join(", ")}`}`,
    `evidence:   ${join(outDir, "evidence.json")}`,
    `report:     ${join(outDir, "report.md")}`,
  ].join("\n");

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
};

async function main(argv) {
  const [sub, ...rest] = argv;
  if (sub === "detect") {
    if (!rest[0]) return fail(`${USAGE}\n\ndetect requires a <target>`);
    process.stdout.write(`${JSON.stringify(detect(rest[0]), null, 2)}\n`);
    return;
  }
  if (sub === "readiness") {
    process.stdout.write(`${JSON.stringify(await probeEngines(), null, 2)}\n`);
    return;
  }
  if (sub === "analyze") {
    const opts = {};
    const positional = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--out") opts.out = rest[++i];
      else if (rest[i] === "--json") opts.json = true;
      else positional.push(rest[i]);
    }
    if (!positional[0]) return fail(`${USAGE}\n\nanalyze requires a <target>`);
    const result = await analyze(positional[0], opts);
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result.bundle, null, 2)}\n`);
    } else {
      process.stdout.write(`${planSummary(result)}\n`);
    }
    if (result.exitCode !== 0) {
      process.stderr.write(`${failClosedMessage(result)}\n`);
    }
    process.exitCode = result.exitCode;
    return;
  }
  fail(USAGE);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`rea-harness: ${err?.stack ?? err}\n`);
    process.exitCode = 1;
  });
}
