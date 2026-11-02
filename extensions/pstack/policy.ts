/**
 * Pure decision logic for pstack's bash confirmation gate.
 *
 * No I/O and no Pi imports: `bun test extensions` exercises this file without a
 * Pi runtime. The gate itself lives in index.ts and is only responsible for
 * asking the human and remembering the answer.
 */

export const CONFIRM_MODES = ["strict", "external", "off"] as const;
export type ConfirmMode = (typeof CONFIRM_MODES)[number];

export const REMEMBER_MODES = ["session", "off"] as const;
export type RememberMode = (typeof REMEMBER_MODES)[number];

/**
 * `external` leaves the machine or mutates shared state. `local` only touches
 * this filesystem, so a stricter gate keeps it and `external` mode drops it.
 */
export type ConfirmTier = "external" | "local";

export interface GatePattern {
  /** Short label shown in the dialog. Also the session-memory key. */
  operation: string;
  pattern: RegExp;
  tier: ConfirmTier;
}

/**
 * Upstream pstack matches every one of these as a substring of the whole
 * command, so compound commands, `echo "git push"` and `grep -r "rm -rf"` all
 * trip the gate. That false-positive rate is intentional parity: the default
 * mode must behave exactly like the extension this fork replaces.
 */
export const GATE_PATTERNS: readonly GatePattern[] = [
  { operation: "git push", pattern: /\bgit\s+push\b/, tier: "external" },
  { operation: "GitHub pull-request mutation", pattern: /\bgh\s+pr\s+(create|edit|merge|close)\b/, tier: "external" },
  { operation: "Graphite mutation", pattern: /\bgt\s+(submit|merge|create)\b/, tier: "external" },
  { operation: "infrastructure mutation", pattern: /\b(terraform|tofu)\s+(apply|destroy)\b/, tier: "external" },
  { operation: "Kubernetes mutation", pattern: /\bkubectl\s+(apply|delete|rollout)\b/, tier: "external" },
  { operation: "deployment", pattern: /\b(vercel|flyctl|railway)\s+(deploy|promote)\b/, tier: "external" },
  { operation: "recursive deletion", pattern: /\brm\s+(-[A-Za-z]*r|--recursive)/, tier: "local" },
];

/** Patterns live under a mode. `off` gates nothing. */
export function activePatterns(mode: ConfirmMode): readonly GatePattern[] {
  if (mode === "off") return [];
  if (mode === "external") return GATE_PATTERNS.filter((entry) => entry.tier === "external");
  return GATE_PATTERNS;
}

/** Operation label of the first pattern matching `command`, or undefined to allow. */
export function matchOperation(command: string | null | undefined, mode: ConfirmMode): string | undefined {
  if (!command) return undefined;
  return activePatterns(mode).find((entry) => entry.pattern.test(command))?.operation;
}

export function isConfirmMode(value: unknown): value is ConfirmMode {
  return typeof value === "string" && (CONFIRM_MODES as readonly string[]).includes(value);
}

export function isRememberMode(value: unknown): value is RememberMode {
  return typeof value === "string" && (REMEMBER_MODES as readonly string[]).includes(value);
}

/**
 * Parse a user-supplied mode. Accepts the canonical names plus the obvious
 * shorthands people type in an env var. Unknown values return undefined so a
 * typo falls back to the configured mode instead of silently disabling safety.
 */
export function parseConfirmMode(raw: unknown): ConfirmMode | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;
  if (value === "strict" || value === "all" || value === "on" || value === "true" || value === "1" || value === "yes") return "strict";
  if (value === "external" || value === "external-only" || value === "outside") return "external";
  if (value === "off" || value === "none" || value === "false" || value === "0" || value === "no") return "off";
  return undefined;
}

export function parseRememberMode(raw: unknown): RememberMode | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;
  if (value === "session" || value === "on" || value === "true" || value === "1" || value === "yes" || value === "always") return "session";
  if (value === "off" || value === "false" || value === "0" || value === "no" || value === "never") return "off";
  return undefined;
}

/**
 * Env wins over the file, in both directions: `PI_PSTACK_CONFIRM=strict`
 * re-enables a gate the config turned off, and `=off` disables one the config
 * enabled. An unset or unparseable value keeps the file's mode.
 */
export function resolveConfirmMode(envValue: unknown, fileMode: ConfirmMode): ConfirmMode {
  return parseConfirmMode(envValue) ?? fileMode;
}

/** One line, whitespace collapsed, hard-capped so a dialog never overflows. */
export function previewCommand(command: string, max = 100): string {
  const collapsed = command.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, Math.max(0, max - 1))}…`;
}
