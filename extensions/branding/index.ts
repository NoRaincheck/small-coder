import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Replaces pi's startup header with small-coder branding + terminal title.
// Hooks session_start to set the terminal title and inject a branded welcome message.

const VERSION = "0.1.0"; // synced with package.json — updated at publish time

function getPackageVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version || VERSION;
  } catch {
    return VERSION;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const version = getPackageVersion();

    // Set terminal title to small-coder branding
    try {
      process.stdout.write(`\x1b]0;small-coder v${version}\x07`);
    } catch {
      // best-effort — ignore if stdout is not a TTY
    }

    // Inject branded welcome message (only shown once per session)
    ctx.ui.notify(
      `small-coder v${version} — scaffold-model-fit extensions active.`,
      "info",
    );
  });
}
