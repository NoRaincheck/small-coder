// Shared configuration loader for small-coder.
// Reads ~/.pi/agent/small-coder.json and falls back to defaults.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SmallCoderConfig {
  permissionMode?: "accept-all" | "auto" | "manual";
  bashAllow?: string; // comma-separated prefixes
  maxTurns?: number;
  allowedTools?: string; // comma-separated tool names
}

const DEFAULT_CONFIG: SmallCoderConfig = {};

let cachedConfig: SmallCoderConfig | null = null;

function loadRawConfig(): SmallCoderConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = join(homedir(), ".pi", "agent", "small-coder.json");
  let config: SmallCoderConfig = {};

  try {
    if (existsSync(configPath)) {
      const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
      if (parsed && typeof parsed === "object") {
        config = { ...config, ...parsed };
      }
    }
  } catch {
    // Best-effort — fall back to defaults
  }

  cachedConfig = config;
  return config;
}

/**
 * Get a string value from the config.
 */
export function getString(
  key: "permissionMode" | "bashAllow" | "allowedTools",
  defaultValue?: string,
): string | undefined {
  const config = loadRawConfig();
  const val = config[key];
  if (typeof val === "string") return val as string;
  return defaultValue;
}

/**
 * Get a number value from the config.
 */
export function getNumber(
  key: "maxTurns",
  defaultValue?: number,
): number | undefined {
  const config = loadRawConfig();
  const val = config[key];
  if (typeof val === "number") return val;
  return defaultValue;
}

/**
 * Invalidate the cached config (useful for testing or hot-reload scenarios).
 */
export function invalidateCache(): void {
  cachedConfig = null;
}
