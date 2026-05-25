import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Bash command whitelist enforcement.
// Config: ~/.pi/agent/small-coder.json → { permissionMode, bashAllow }


import { getString } from "../_shared/config.ts";

const DEFAULT_ALLOW_LIST = new Set([
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
  // Git operations
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
  "git push",
  "git pull",
  // File operations (safe subset)
  "cp ",
  "mv ",
  "mkdir",
  "rm ",
  "touch",
  "ln ",
  "chmod",
  "chown",
  // Search & find
  "find ",
  "grep ",
  "rg ",
  "ag ",
  "fd ",
  "locate",
  // Process management
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
  "yarn ",
  "pnpm ",
  "pip install",
  "pip list",
  "pip show",
  "pip freeze",
  "cargo build",
  "cargo test",
  "go build",
  "go test",
]);

function getMode(): "auto" | "accept-all" | "manual" {
  const raw = getString("permissionMode", "auto");
  if (raw === "auto" || raw === "manual" || raw === "accept-all") return raw;
  return "auto";
}

function getBashAllowPrefixes(): string[] {
  const raw = getString("bashAllow", "");
  if (!raw) return [];
  return raw.split(",").map((p) => p.trim()).filter(Boolean);
}

/**
 * Check if a command is allowed by the whitelist.
 */
function isCommandAllowed(command: string): boolean {
  const prefixes = [...DEFAULT_ALLOW_LIST, ...getBashAllowPrefixes()];

  for (const prefix of prefixes) {
    if (command.startsWith(prefix)) return true;
  }

  return false;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const mode = getMode();
    if (mode === "accept-all") return; // default: no gating

    if (event.toolName !== "bash") return;

    const evt = event as any;
    const command = evt.input?.command || "";
    if (typeof command !== "string" || !command) return;

    if (isCommandAllowed(command)) return; // already allowed

    if (mode === "manual") {
      const ok = await ctx.ui.confirm(
        `Bash: ${command.slice(0, 80)}${command.length > 80 ? "..." : ""}`,
        "Allow this bash command?",
      );
      if (!ok) {
        return {
          block: true,
          reason: "Blocked by permission gate (user denied)",
        };
      }
    } else {
      // auto mode — block and notify
      ctx.ui.notify(
        `harness intervention: bash command blocked by whitelist — "${
          command.slice(0, 60)
        }${command.length > 60 ? "..." : ""}"`,
        "warning",
      );
      return {
        block: true,
        reason: "Bash command not in whitelist. Use allowed commands only.",
      };
    }
  });
}
