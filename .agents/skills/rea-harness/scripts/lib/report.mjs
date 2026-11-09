const escCell = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");

const escMermaid = (value) =>
  String(value ?? "")
    .replace(/"/g, "'")
    .replace(/\r?\n/g, " ");

const escText = (value) => String(value ?? "").replace(/\r?\n/g, " ");

const renderMermaid = (direction, lines) => [
  "```mermaid",
  `flowchart ${direction}`,
  ...lines.map((l) => `  ${l}`),
  "```",
  "",
];

const renderSystemChart = (systems) =>
  renderMermaid(
    "TD",
    systems.map((s, i) => `S${i}[${escMermaid(s.name)}]`),
  );

const renderMethodChart = (commands) => {
  if (commands.length === 0) {
    return renderMermaid("LR", [`R["Report"]`]);
  }
  const nodes = commands.map((c, i) => `C${i}[${escMermaid(c)}]`);
  return renderMermaid("LR", [`${nodes.join(" --> ")} --> R["Report"]`]);
};

const renderFactsTable = (facts) => {
  const sorted = [...facts].sort((a, b) =>
    a.category.localeCompare(b.category),
  );
  const rows = [
    "| id | category | claim | evidence_class | source |",
    "| -- | -------- | ----- | -------------- | ------ |",
    ...sorted.map(
      (f) =>
        `| ${escCell(f.id)} | ${escCell(f.category)} | ${escCell(f.claim)} | [${f.evidence_class}] | ${escCell(f.source)} |`,
    ),
  ];
  return rows.join("\n");
};

const renderFlowTable = (entries) => {
  const rows = entries.map((e) =>
    typeof e === "object" && e !== null ? e : { value: e },
  );
  const columns = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  return [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map(
      (row) => `| ${columns.map((c) => escCell(row[c] ?? "")).join(" | ")} |`,
    ),
  ].join("\n");
};

const classCounts = (facts) => {
  const counts = { obs: 0, der: 0, inf: 0, unk: 0 };
  for (const f of facts) counts[f.evidence_class]++;
  return counts;
};

export function bundleToMarkdown(bundle) {
  const { target = {}, readiness = {}, run = {}, facts = [] } = bundle;
  const flows = {
    upstream: bundle.flows?.upstream ?? [],
    downstream: bundle.flows?.downstream ?? [],
    telemetry: bundle.flows?.telemetry ?? [],
  };
  const systems = bundle.systems ?? [];
  const artifacts = bundle.artifacts ?? [];
  const commands = run.commands ?? [];
  const counts = classCounts(facts);
  const categories = new Set(facts.map((f) => f.category)).size;
  const available = readiness.available ?? [];
  const missing = readiness.missing ?? [];

  const lines = [];

  lines.push(`# ${escText(target.source)} — Reverse Engineering Report`);
  lines.push("");
  lines.push(
    "> Evidence tags on every claim: `[obs]` observation · `[der]` derivation · `[inf]` inference · `[unk]` unknown.",
  );
  lines.push(
    `> Target kind \`${escText(target.kind)}\` · format \`${escText(target.format)}\`` +
      (target.digest ? ` · digest \`${escText(target.digest)}\`` : "") +
      (target.confidence !== undefined
        ? ` · detection confidence ${target.confidence}`
        : ""),
  );
  lines.push("");
  lines.push("## 1. Abstract");
  lines.push("");
  lines.push(
    `This report presents the reverse engineering analysis of \`${escText(target.source)}\` (` +
      `\`${escText(target.format)}\`). The recorded evidence comprises ${facts.length} fact` +
      `${facts.length === 1 ? "" : "s"} across ${categories} categor` +
      `${categories === 1 ? "y" : "ies"} (${counts.obs} observed, ${counts.der} derived, ` +
      `${counts.inf} inferred, ${counts.unk} unknown), ${systems.length} system` +
      `${systems.length === 1 ? "" : "s"}, ${flows.upstream.length + flows.downstream.length + flows.telemetry.length} ` +
      `data-flow entr${flows.upstream.length + flows.downstream.length + flows.telemetry.length === 1 ? "y" : "ies"}, ` +
      `and ${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}.`,
  );
  lines.push("");
  lines.push("## 2. Objective & Motivation");
  lines.push("");
  lines.push(
    `The objective is to explain the structure, behavior, and data flow of \`${escText(target.source)}\` ` +
      `from the recorded evidence. Findings are tagged by evidence class per the legend above; ` +
      "claims marked `[inf]` or `[unk]` are not established by observation and are listed in section 6.",
  );
  lines.push("");
  lines.push("## 3. Pre-requisites & Tools");
  lines.push("");
  if (available.length > 0 || missing.length > 0) {
    lines.push("| Tool | Status |");
    lines.push("| ---- | ------ |");
    for (const tool of available) {
      lines.push(`| ${escCell(tool)} | available |`);
    }
    for (const tool of missing) {
      lines.push(`| ${escCell(tool)} | missing |`);
    }
  } else {
    lines.push("_No tool availability was recorded._");
  }
  lines.push("");
  lines.push(
    "Missing tools limit the evidence that could be collected; each gap reduces the confidence of the affected findings (see section 6).",
  );
  lines.push("");
  lines.push("## 4. Method / Framework / Flow");
  lines.push("");
  if (commands.length > 0) {
    lines.push("Commands executed:");
    lines.push("");
    lines.push("```");
    for (const command of commands) lines.push(escText(command));
    lines.push("```");
  }
  lines.push("");
  lines.push(...renderMethodChart(commands));
  lines.push("");
  lines.push("## 5. Results");
  lines.push("");
  lines.push("### 5.1 Facts");
  lines.push("");
  if (facts.length > 0) {
    lines.push(renderFactsTable(facts));
  } else {
    lines.push("_No facts recorded._");
  }
  lines.push("");
  if (systems.length > 0) {
    lines.push("### 5.2 Systems / architecture");
    lines.push("");
    lines.push(...renderSystemChart(systems));
    lines.push("");
  }
  const flowSections = [
    ["upstream", "Upstream"],
    ["downstream", "Downstream"],
    ["telemetry", "Telemetry"],
  ].filter(([key]) => flows[key].length > 0);
  if (flowSections.length > 0) {
    lines.push("### 5.3 Data flows");
    lines.push("");
    for (const [key, label] of flowSections) {
      lines.push(`#### ${label}`);
      lines.push("");
      lines.push(renderFlowTable(flows[key]));
      lines.push("");
    }
  }
  lines.push("### 5.4 Artifacts");
  lines.push("");
  if (artifacts.length > 0) {
    for (const artifact of artifacts) {
      lines.push(
        `- **${escText(artifact.kind)}**: \`${escText(artifact.path)}\``,
      );
    }
  } else {
    lines.push("_No artifacts recorded._");
  }
  lines.push("");
  lines.push("## 6. Limitations & unknowns");
  lines.push("");
  const unknown = facts.filter(
    (f) => f.evidence_class === "inf" || f.evidence_class === "unk",
  );
  if (unknown.length > 0) {
    for (const f of unknown) {
      lines.push(
        `- \`[${f.evidence_class}]\` ${escText(f.claim)} (_source: ${escText(f.source)}_)`,
      );
    }
  } else {
    lines.push("_None recorded._");
  }
  lines.push("");
  lines.push("## 7. Conclusion & recommendations");
  lines.push("");
  lines.push(
    `This analysis records ${facts.length} fact${facts.length === 1 ? "" : "s"} and ${systems.length} system` +
      `${systems.length === 1 ? "" : "s"}. Recommendations must be grounded in the section 5 findings ` +
      "and bounded by the unknowns listed in section 6.",
  );
  lines.push("");

  return lines.join("\n");
}
