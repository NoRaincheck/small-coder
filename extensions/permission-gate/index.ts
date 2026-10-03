import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getString } from "../_shared/config.ts";
import { isCommandAllowed } from "./allow.ts";

// Bash command whitelist enforcement.
//
// Every segment of the command must clear the bar — `ls; rm -rf ~` does not
// pass a `ls` allow-list (see ./allow.ts).
//
// Config: ~/.pi/agent/small-coder.json → { permissionMode, bashAllow }

const DEFAULT_ALLOW_LIST = [
  // Navigation & inspection
  "cd",
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "less",
  "more",
  "file",
  "stat",
  // Git (read-only + local history; no push)
  "git log",
  "git status",
  "git diff",
  "git branch",
  "git show",
  "git stash",
  "git checkout",
  "git merge",
  "git rebase",
  "git add",
  "git commit",
  // File operations (safe subset)
  "cp",
  "mv",
  "mkdir",
  "rm",
  "touch",
  "ln",
  "chmod",
  // Search & find
  "find",
  "grep",
  "rg",
  "ag",
  "fd",
  "locate",
  // Process inspection + cleanup (background work is a documented capability,
  // so killing a runaway background job has to stay available)
  "ps",
  "kill",
  "pkill",
  "top",
  "htop",
  // Network (read-only)
  "curl",
  "wget",
  "ping",
  "nslookup",
  "dig",
  // Package managers
  "npm install",
  "npm run",
  "npm test",
  "yarn",
  "pnpm",
  "pip install",
  "pip list",
  "pip show",
  "pip freeze",
  "cargo build",
  "cargo test",
  "go build",
  "go test",
];

function getMode(): "auto" | "accept-all" | "manual" {
  const raw = getString("permissionMode", "auto");
  if (raw === "auto" || raw === "manual" || raw === "accept-all") return raw;
  return "auto";
}

function allowPrefixes(): string[] {
  const raw = getString("bashAllow", "");
  const extra = raw ? raw.split(",").map((p) => p.trim()).filter(Boolean) : [];
  return [...DEFAULT_ALLOW_LIST, ...extra];
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const mode = getMode();
    if (mode === "accept-all") return; // bypass

    if (event.toolName !== "bash") return;

    const command = event.input?.command ?? "";
    if (typeof command !== "string" || !command) return;

    const decision = isCommandAllowed(command, allowPrefixes());
    if (decision.allowed) return;

    const shown = (s: string) =>
      `${s.slice(0, 70)}${s.length > 70 ? "..." : ""}`;

    if (mode === "manual") {
      const ok = await ctx.ui.confirm(
        `Bash: ${shown(command)}`,
        decision.offender
          ? `Segment not in whitelist: ${
            shown(decision.offender)
          }. Allow anyway?`
          : "Allow this bash command?",
      );
      if (!ok) {
        return {
          block: true,
          reason: "Blocked by permission gate (user denied)",
        };
      }
      return;
    }

    // auto mode — block and notify
    ctx.ui.notify(
      `harness intervention: bash command blocked by whitelist — "${
        shown(decision.offender ?? command)
      }"`,
      "warning",
    );
    return {
      block: true,
      reason: decision.offender
        ? `Bash command segment not in whitelist: "${decision.offender}". ` +
          `Every segment must match an allowed command.`
        : "Bash command not in whitelist. Use allowed commands only.",
    };
  });
}
