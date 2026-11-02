import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  isConfirmMode,
  isRememberMode,
  parseConfirmMode,
  type ConfirmMode,
  type RememberMode,
} from "./policy.ts";

export const ROLE_NAMES = [
  "feature, refactoring",
  "bug-fix",
  "perf-issue",
  "hillclimb",
  "judgment and prose",
  "hardest tasks",
  "how explorer",
  "how explainer",
  "how critics",
  "why investigators",
  "why synthesizer",
  "reflect tooling",
  "reflect judgment, divergent, synthesizer",
  "arena runners",
  "arena cross-judge pool",
  "swarm workers",
  "architect runners",
  "interrogate reviewers",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
export type RoleValue = string | string[];

export interface PstackConfig {
  version: 1;
  roles: Record<string, RoleValue>;
}

export function configPath(): string {
  return path.join(getAgentDir(), "pstack", "models.json");
}

export function defaultConfig(): PstackConfig {
  return {
    version: 1,
    roles: Object.fromEntries(ROLE_NAMES.map((role) => [role, "inherit-parent"])),
  };
}

export async function readConfig(): Promise<PstackConfig> {
  try {
    const parsed = JSON.parse(await fs.readFile(configPath(), "utf8")) as Partial<PstackConfig>;
    if (parsed.version !== 1 || !parsed.roles || typeof parsed.roles !== "object") return defaultConfig();
    const roles: Record<string, RoleValue> = { ...defaultConfig().roles };
    for (const [role, value] of Object.entries(parsed.roles)) {
      if (typeof value === "string" || (Array.isArray(value) && value.every((item) => typeof item === "string"))) {
        roles[role] = value;
      }
    }
    return { version: 1, roles };
  } catch {
    return defaultConfig();
  }
}

export async function writeConfig(config: PstackConfig): Promise<void> {
  const target = configPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

/**
 * The confirmation gate lives in its own file, next to models.json, so that
 * `/setup-pstack` and the `pstack_config` tool never touch it. Nothing the
 * model can call reads or writes this file: a tool must not be able to lower
 * the guard on its own actions.
 */
export function confirmConfigPath(): string {
  return path.join(getAgentDir(), "pstack", "config.json");
}

export interface ConfirmSettings {
  mode: ConfirmMode;
  remember: RememberMode;
}

export const DEFAULT_CONFIRM_SETTINGS: ConfirmSettings = { mode: "strict", remember: "session" };

/** Where the effective mode came from. `env` outranks `config`, which outranks the default. */
export type ConfirmSource = "env" | "config" | "default";

export interface EffectiveConfirm {
  settings: ConfirmSettings;
  source: ConfirmSource;
}

/** The one-off override, for scripts and "just this run". */
export function envConfirmMode(env: NodeJS.ProcessEnv = process.env): ConfirmMode | undefined {
  return parseConfirmMode(env.PI_PSTACK_CONFIRM);
}

export async function readConfirmSettings(): Promise<{ settings: ConfirmSettings; source: "config" | "default" }> {
  const fallback = { settings: { ...DEFAULT_CONFIRM_SETTINGS }, source: "default" as const };
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(confirmConfigPath(), "utf8"));
    if (!parsed || typeof parsed !== "object") return fallback;
    const confirm = (parsed as { confirm?: unknown }).confirm;
    if (!confirm || typeof confirm !== "object") return fallback;
    const record = confirm as Record<string, unknown>;
    return {
      settings: {
        mode: isConfirmMode(record.mode) ? record.mode : DEFAULT_CONFIRM_SETTINGS.mode,
        remember: isRememberMode(record.remember) ? record.remember : DEFAULT_CONFIRM_SETTINGS.remember,
      },
      source: "config",
    };
  } catch {
    // Missing file, unreadable file, or invalid JSON: the safe default applies.
    return fallback;
  }
}

/** Merge a patch into `confirm` without disturbing any other key in config.json. */
export async function writeConfirmSettings(patch: Partial<ConfirmSettings>): Promise<void> {
  const target = confirmConfigPath();
  let root: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(target, "utf8"));
    if (parsed && typeof parsed === "object") root = parsed as Record<string, unknown>;
  } catch {
    // Start from scratch; a missing or broken file is not worth failing over.
  }
  const existing = root.confirm && typeof root.confirm === "object" ? (root.confirm as Record<string, unknown>) : {};
  root.confirm = { ...existing, ...patch };
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(root, null, 2)}\n`, { mode: 0o600 });
}

/** Resolve env over config over default. Never throws: an unreadable file falls back to `strict`. */
export async function readEffectiveConfirm(): Promise<EffectiveConfirm> {
  const { settings, source } = await readConfirmSettings();
  const fromEnv = envConfirmMode();
  if (fromEnv) return { settings: { ...settings, mode: fromEnv }, source: "env" };
  return { settings, source };
}

export function modelsForRole(config: PstackConfig, role: string | undefined): string[] {
  if (!role) return [];
  const value = config.roles[role];
  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  return values.filter((model) => model !== "inherit-parent" && model !== "auto");
}

export function modelForRole(config: PstackConfig, role: string | undefined): string | undefined {
  return modelsForRole(config, role)[0];
}
