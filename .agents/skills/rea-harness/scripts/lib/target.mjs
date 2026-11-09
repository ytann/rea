import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const SAMPLE = 1 << 20;

const UNKNOWN = {
  format: "unknown",
  suggested_provider: "filesystem",
  required_engines: [],
  confidence: 0.1,
};

const PE_ROUTE = {
  provider: "ghidra",
  workflow: [
    "inspect-binary-layout",
    "inspect-pe-imports",
    "inspect-pe-resources",
    "inspect-with-objdump",
  ],
  required_engines: ["ghidra"],
};

const ROUTES = {
  apk: {
    provider: "jadx",
    workflow: ["inspect-apk-signature", "inspect-android-package", "decompile"],
    required_engines: ["jadx"],
  },
  ipa: {
    provider: "filesystem",
    workflow: ["extract-artifact", "inspect-macho", "inspect-plist"],
    required_engines: [],
  },
  web: {
    provider: "browser",
    workflow: [
      "observe-web-execution",
      "inspect-web-network-capture",
      "inspect-web-page",
    ],
    required_engines: [],
  },
  deb: {
    provider: "filesystem",
    workflow: ["inspect-artifact", "extract-artifact"],
    required_engines: [],
  },
  exe: { ...PE_ROUTE, workflow: [...PE_ROUTE.workflow] },
  pe: PE_ROUTE,
  elf: {
    provider: "ghidra",
    workflow: [
      "inspect-binary-layout",
      "inspect-elf-notes",
      "inspect-with-objdump",
    ],
    required_engines: ["ghidra"],
  },
  macho: {
    provider: "ghidra",
    workflow: ["inspect-macho", "inspect-binary-layout"],
    required_engines: ["ghidra"],
  },
  js: {
    provider: "browser",
    workflow: ["analyze-web-bundle", "analyze-javascript-application"],
    required_engines: [],
  },
  py: {
    provider: "filesystem",
    workflow: ["analyze", "inspect-python-pyc"],
    required_engines: [],
  },
  go: {
    provider: "ghidra",
    workflow: ["inspect-go-binary", "inspect-binary-layout"],
    required_engines: ["ghidra"],
  },
  rust: {
    provider: "ghidra",
    workflow: ["inspect-rust-binary", "inspect-binary-layout"],
    required_engines: ["ghidra"],
  },
  dotnet: {
    provider: "filesystem",
    workflow: ["inspect-managed-artifact"],
    required_engines: [],
  },
  firmware: {
    provider: "filesystem",
    workflow: ["inspect-firmware-regions", "extract-firmware"],
    required_engines: [],
  },
  pcap: {
    provider: "tshark",
    workflow: ["inspect-packet-capture", "inspect-packet-fields"],
    required_engines: ["tshark"],
  },
  sqlite: {
    provider: "sqlite",
    workflow: ["inspect-sqlite-database"],
    required_engines: [],
  },
  unknown: {
    provider: "filesystem",
    workflow: ["inspect-artifact"],
    required_engines: [],
  },
};

const EXTENSIONS = {
  ".deb": "deb",
  ".rpm": "deb",
  ".apk": "apk",
  ".ipa": "ipa",
  ".exe": "pe",
  ".dll": "pe",
  ".js": "js",
  ".py": "py",
  ".go": "go",
  ".rs": "rust",
  ".cs": "dotnet",
};

const ZIP_HEAD = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];
const MZ = [0x4d, 0x5a];
const ELF = [0x7f, 0x45, 0x4c, 0x46];
const MACHO = [
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xca, 0xfe, 0xba, 0xbe],
];
const PCAP = [
  [0xa1, 0xb2, 0xc3, 0xd4],
  [0xd4, 0xc3, 0xb2, 0xa1],
  [0xa1, 0xb2, 0x3c, 0x4d],
  [0x4d, 0x3c, 0xb2, 0xa1],
];
const WASM = [0x00, 0x61, 0x73, 0x6d];
const SQLITE = [
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74,
  0x20, 0x33, 0x00,
];

const matches = (bytes, offset, pattern) =>
  pattern.every((x, i) => bytes[offset + i] === x);

const guessByExtension = (path) => {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return null;
  const format = EXTENSIONS[path.slice(dot).toLowerCase()];
  if (!format) return null;
  const row = ROUTES[format];
  return {
    format,
    suggested_provider: row.provider,
    required_engines: row.required_engines,
    confidence: 0.4,
  };
};

function sniff(bytes) {
  const head = bytes.subarray(0, Math.min(bytes.length, SAMPLE));
  const tail =
    bytes.length > SAMPLE ? bytes.subarray(bytes.length - SAMPLE) : head;
  // ponytail: zip markers scanned only in the first/last 1 MiB windows; an APK
  // with its central directory beyond that is missed until full-file streaming.
  const body =
    head === tail
      ? Buffer.from(head)
      : Buffer.concat([Buffer.from(head), Buffer.from(tail)]);

  if (matches(head, 0, ZIP_HEAD) || matches(head, 0, ZIP_EMPTY)) {
    const text = body.toString("latin1");
    if (
      text.includes("META-INF/MANIFEST.MF") ||
      text.includes("AndroidManifest.xml")
    ) {
      return {
        format: "apk",
        suggested_provider: "jadx",
        required_engines: ["jadx"],
        confidence: 0.9,
      };
    }
    return UNKNOWN;
  }
  if (matches(head, 0, MZ)) {
    return {
      format: "pe",
      suggested_provider: "ghidra",
      required_engines: ["ghidra"],
      confidence: 0.95,
    };
  }
  if (matches(head, 0, ELF)) {
    return {
      format: "elf",
      suggested_provider: "ghidra",
      required_engines: ["ghidra"],
      confidence: 0.95,
    };
  }
  if (MACHO.some((m) => matches(head, 0, m))) {
    return {
      format: "macho",
      suggested_provider: "ghidra",
      required_engines: ["ghidra"],
      confidence: 0.95,
    };
  }
  if (matches(head, 0, SQLITE)) {
    return {
      format: "sqlite",
      suggested_provider: "sqlite",
      required_engines: [],
      confidence: 0.95,
    };
  }
  if (PCAP.some((m) => matches(head, 0, m))) {
    return {
      format: "pcap",
      suggested_provider: "tshark",
      required_engines: ["tshark"],
      confidence: 0.95,
    };
  }
  if (matches(head, 0, WASM)) {
    return {
      format: "js",
      suggested_provider: "browser",
      required_engines: [],
      confidence: 0.9,
    };
  }
  return UNKNOWN;
}

export function detect(target) {
  if (typeof target === "string") {
    if (target.startsWith("http://") || target.startsWith("https://")) {
      return {
        kind: "url",
        format: "web",
        source: target,
        digest: "",
        confidence: 0.9,
        suggested_provider: "browser",
        required_engines: [],
      };
    }
    let contents;
    try {
      contents = readFileSync(target);
    } catch {
      return { kind: "file", source: target, digest: "", ...UNKNOWN };
    }
    const digest = createHash("sha256").update(contents).digest("hex");
    const sniffed = sniff(contents);
    if (sniffed.format === "unknown") {
      const byExt = guessByExtension(target);
      if (byExt) return { kind: "file", source: target, digest, ...byExt };
    }
    return { kind: "file", source: target, digest, ...sniffed };
  }
  if (target instanceof Uint8Array) {
    const digest = createHash("sha256").update(target).digest("hex");
    return { kind: "bytes", source: "", digest, ...sniff(target) };
  }
  return { kind: "bytes", source: "", digest: "", ...UNKNOWN };
}

export function route(format) {
  const row = ROUTES[format] ?? ROUTES.unknown;
  return {
    provider: row.provider,
    workflow: [...row.workflow],
    required_engines: [...row.required_engines],
  };
}
