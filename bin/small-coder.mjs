#!/usr/bin/env node
// small-coder launcher.
// Spawns the bundled pi runtime with our AGENTS.md, skills, and every
// custom extension wired in — works from any working directory.
//
// This is an optional drop-in replacement for users who want the exact
// little-coder CLI experience (update-check, quietStartup patching, etc.).
// Most users should just run `pi` directly — the extensions auto-discover.

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---- 1. Node version preflight (>= 22.19.0) ----
const MIN_NODE = [22, 19, 0];
const cur = process.versions.node.split(".").map((n) => parseInt(n, 10));
const tooOld = cur[0] < MIN_NODE[0] ||
  (cur[0] === MIN_NODE[0] && cur[1] < MIN_NODE[1]) ||
  (cur[0] === MIN_NODE[0] && cur[1] === MIN_NODE[1] && cur[2] < MIN_NODE[2]);
if (tooOld) {
  console.error(
    `small-coder requires Node.js >= ${
      MIN_NODE.join(".")
    } (you have ${process.versions.node}).\n` +
      `Install a newer Node from https://nodejs.org or via nvm: 'nvm install 22'.`,
  );
  process.exit(1);
}

// ---- 2. Resolve package install root ----
const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");

// ---- 3. Resolve the bundled pi CLI entry point ----
const piPkgRoot = join(
  pkgRoot,
  "node_modules",
  "@earendil-works",
  "pi-coding-agent",
);
let piEntry;
try {
  const piPkgJson = JSON.parse(
    readFileSync(join(piPkgRoot, "package.json"), "utf-8"),
  );
  const binRel = typeof piPkgJson?.bin === "string"
    ? piPkgJson.bin
    : piPkgJson?.bin?.pi;
  if (typeof binRel !== "string") {
    throw new Error("pi package.json has no bin.pi entry");
  }
  piEntry = resolve(piPkgRoot, binRel);
} catch (err) {
  console.error(
    `small-coder: cannot resolve pi cli entry under ${piPkgRoot}.\n` +
      `Underlying error: ${err?.message ?? err}\n` +
      `Try reinstalling: npm install -g small-coder`,
  );
  process.exit(1);
}
if (!existsSync(piEntry)) {
  console.error(
    `small-coder: cannot find pi at ${piEntry}.\n` +
      `Try reinstalling: npm install -g small-coder`,
  );
  process.exit(1);
}

// ---- 4. Auto-discover bundled extensions ----
const extDir = join(pkgRoot, "extensions");
const extArgs = [];
if (existsSync(extDir)) {
  for (const name of readdirSync(extDir).sort()) {
    const subdir = join(extDir, name);
    const idx = join(subdir, "index.ts");
    try {
      if (statSync(subdir).isDirectory() && existsSync(idx)) {
        // Skip _shared (library code, not an extension)
        if (name === "_shared") continue;
        extArgs.push("--extension", idx);
      }
    } catch {
      // skip unreadable entries
    }
  }
}

// ---- 5. Compose pi argv ----
const userArgs = process.argv.slice(2);
const agentsMd = join(pkgRoot, "AGENTS.md");
const piArgs = [
  "--no-context-files",
  "--no-extensions",
  ...(existsSync(agentsMd) ? ["--system-prompt", agentsMd] : []),
  ...extArgs,
  ...userArgs,
];

// ---- 6. Suppress pi's own version-banner by default ----
if (process.env.PI_SKIP_VERSION_CHECK === undefined) {
  process.env.PI_SKIP_VERSION_CHECK = "1";
}

// ---- 7. Force pi's global quietStartup + pin lastChangelogVersion ----
try {
  const agentDirEnv = process.env.PI_CODING_AGENT_DIR;
  let agentDir;
  if (agentDirEnv && agentDirEnv.trim().length > 0) {
    agentDir = agentDirEnv === "~"
      ? homedir()
      : agentDirEnv.startsWith("~/")
      ? homedir() + agentDirEnv.slice(1)
      : agentDirEnv;
  } else {
    agentDir = join(homedir(), ".pi", "agent");
  }
  mkdirSync(agentDir, { recursive: true });
  const globalSettingsPath = join(agentDir, "settings.json");
  let globalSettings = {};
  if (existsSync(globalSettingsPath)) {
    try {
      const parsed = JSON.parse(readFileSync(globalSettingsPath, "utf-8"));
      if (parsed && typeof parsed === "object") globalSettings = parsed;
    } catch {
      globalSettings = {};
    }
  }

  let bundledPiVersion;
  try {
    const piPkgJson = JSON.parse(
      readFileSync(join(piPkgRoot, "package.json"), "utf-8"),
    );
    if (typeof piPkgJson?.version === "string") {
      bundledPiVersion = piPkgJson.version;
    }
  } catch {}

  let mutated = false;
  if (globalSettings.quietStartup !== true) {
    globalSettings.quietStartup = true;
    mutated = true;
  }
  if (
    bundledPiVersion && globalSettings.lastChangelogVersion !== bundledPiVersion
  ) {
    globalSettings.lastChangelogVersion = bundledPiVersion;
    mutated = true;
  }
  if (mutated) {
    writeFileSync(globalSettingsPath, JSON.stringify(globalSettings, null, 2));
  }
} catch {
  // Best-effort — fall back to pi's built-in defaults
}

// ---- 8. Spawn pi in the user's cwd ----
const child = spawn(process.execPath, [piEntry, ...piArgs], {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

const forward = (sig) => () => {
  try {
    child.kill(sig);
  } catch {}
};
process.on("SIGINT", forward("SIGINT"));
process.on("SIGTERM", forward("SIGTERM"));
process.on("SIGHUP", forward("SIGHUP"));

child.on("error", (err) => {
  console.error("small-coder: failed to start pi:", err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
