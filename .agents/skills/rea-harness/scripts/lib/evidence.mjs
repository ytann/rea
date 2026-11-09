import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const SCHEMA_VERSION = "1.0";
const EVIDENCE_CLASSES = ["obs", "der", "inf", "unk"];

const schema = JSON.parse(
  readFileSync(new URL("./evidence-schema.json", import.meta.url), "utf8"),
);
const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(schema);

export function createBundle(target, readiness) {
  return {
    schema_version: SCHEMA_VERSION,
    target,
    readiness,
    run: {
      started_at: new Date().toISOString(),
      completed_at: "",
      commands: [],
    },
    facts: [],
    flows: { upstream: [], downstream: [], telemetry: [] },
    systems: [],
    artifacts: [],
  };
}

function assertEvidenceClass(evidence_class) {
  if (!EVIDENCE_CLASSES.includes(evidence_class)) {
    throw new Error(`invalid evidence_class: ${evidence_class}`);
  }
}

export function addFact(bundle, fact) {
  assertEvidenceClass(fact.evidence_class);
  bundle.facts.push(fact);
  return bundle;
}

export function addSystem(bundle, system) {
  assertEvidenceClass(system.evidence_class);
  bundle.systems.push(system);
  return bundle;
}

export function validateBundle(bundle) {
  if (!bundle || typeof bundle !== "object") {
    return { ok: false, errors: ["bundle must be an object"] };
  }
  const errors = [];
  if (bundle.schema_version !== SCHEMA_VERSION) {
    errors.push(
      `unsupported schema_version: ${bundle.schema_version ?? "missing"}`,
    );
  }
  if (!validate(bundle)) {
    for (const err of validate.errors) {
      errors.push(`${err.instancePath || "/"} ${err.message}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeBundle(bundle) {
  if (!bundle || typeof bundle !== "object" || !bundle.schema_version) {
    throw new Error("bundle missing schema_version");
  }
  return {
    schema_version: bundle.schema_version,
    target: bundle.target ?? {},
    readiness: bundle.readiness ?? {},
    run: bundle.run ?? {},
    facts: bundle.facts ?? [],
    flows: {
      upstream: bundle.flows?.upstream ?? [],
      downstream: bundle.flows?.downstream ?? [],
      telemetry: bundle.flows?.telemetry ?? [],
    },
    systems: bundle.systems ?? [],
    artifacts: bundle.artifacts ?? [],
  };
}
