import { execFileSync } from "node:child_process";

const PROBE_TIMEOUT_MS = 2000;

// Engines whose version can be read with one cheap flag; probing is
// best-effort and never affects availability.
const VERSION_FLAGS = {
  python3: ["--version"],
  node: ["--version"],
  ffmpeg: ["-version"],
  jadx: ["--version"],
  objdump: ["--version"],
};

const resolveBinary = (name) => {
  try {
    return execFileSync(
      "/bin/sh",
      ["-c", 'command -v "$1" 2>/dev/null', "sh", name],
      {
        timeout: PROBE_TIMEOUT_MS,
        encoding: "utf8",
      },
    ).trim();
  } catch {
    return "";
  }
};

// Default lookup: "command -v <name>", plus one cheap version flag for
// engines that support it. Probeable engines resolve to their version string
// when the flag probe succeeds and to the binary path otherwise; availability
// always follows command -v. Every exec is timeout-bounded and non-fatal.
function defaultLookup(name) {
  const path = resolveBinary(name);
  if (!path) return "";
  const flags = VERSION_FLAGS[name];
  if (!flags) return path;
  try {
    const out = execFileSync(path, flags, {
      timeout: PROBE_TIMEOUT_MS,
      encoding: "utf8",
    });
    return out.trim().split("\n")[0] || path;
  } catch {
    return path;
  }
}

const versionProbe = (name) => (lookup) => lookup(name);

export const KNOWN_ENGINES = [
  { name: "ghidra", probe: () => "" },
  { name: "ida", probe: () => "" },
  { name: "hopper", probe: () => "" },
  { name: "kuna", probe: () => "" },
  { name: "jadx", probe: versionProbe("jadx") },
  { name: "apktool", probe: () => "" },
  { name: "mitmdump", probe: () => "" },
  { name: "adb", probe: () => "" },
  { name: "objdump", probe: versionProbe("objdump") },
  { name: "tshark", probe: () => "" },
  { name: "python3", probe: versionProbe("python3") },
  { name: "ffmpeg", probe: versionProbe("ffmpeg") },
  { name: "manim", probe: () => "" },
  { name: "binwalk", probe: () => "" },
  { name: "unblob", probe: () => "" },
  { name: "node", probe: versionProbe("node") },
];

export async function probeEngines(lookup = defaultLookup) {
  const available = [];
  const missing = [];
  const versions = {};
  for (const { name, probe } of KNOWN_ENGINES) {
    const probed = await probe(lookup);
    const found = probed || lookup(name);
    if (!found) {
      missing.push(name);
      continue;
    }
    available.push(name);
    if (probed) versions[name] = probed;
  }
  return { available, missing, versions };
}

export function checkReadiness(requiredEngines, availability) {
  const present = new Set(availability.available ?? []);
  const missing = requiredEngines.filter((name) => !present.has(name));
  return { ok: missing.length === 0, missing };
}

export const REMEDIATION = {
  ghidra:
    "download Ghidra from https://ghidra-sre.org and add its launcher (or analyzeHeadless) to PATH",
  ida: "install IDA from https://hex-rays.com/ida-pro and add the ida/idat binary to PATH",
  hopper:
    "install Hopper from https://www.hopperapp.com and add the hopper CLI to PATH",
  kuna: "install Kuna and add the kuna binary to PATH",
  jadx: "install JADX from https://github.com/skylot/jadx",
  apktool:
    "download apktool from https://ibotpeaches.github.io/Apktool/ and add it to PATH",
  mitmdump: "install mitmproxy (https://mitmproxy.org) to get the mitmdump CLI",
  adb: "install Android platform-tools (https://developer.android.com/tools/releases/platform-tools) to get adb",
  objdump: "install binutils for your platform to get objdump",
  tshark: "install Wireshark (https://www.wireshark.org) or the tshark package",
  python3: "install Python 3 from https://www.python.org",
  ffmpeg:
    "install ffmpeg from https://ffmpeg.org or your system package manager",
  manim: "install Manim from https://www.manim.community (pip install manim)",
  binwalk: "install binwalk from https://github.com/ReFirmLabs/binwalk",
  unblob: "install unblob from https://unblob.org (pip install unblob)",
  node: "install Node.js from https://nodejs.org",
};
