import { describe, expect, it } from "bun:test";
import {
  CONFIRM_MODES,
  GATE_PATTERNS,
  activePatterns,
  isConfirmMode,
  isRememberMode,
  matchOperation,
  parseConfirmMode,
  parseRememberMode,
  previewCommand,
  resolveConfirmMode,
} from "./policy.ts";

describe("matchOperation", () => {
  it("allows ordinary local commands", () => {
    expect(matchOperation("git status", "strict")).toBeUndefined();
    expect(matchOperation("ls -la && cat README.md", "strict")).toBeUndefined();
    expect(matchOperation(undefined, "strict")).toBeUndefined();
    expect(matchOperation("", "strict")).toBeUndefined();
  });

  it("holds every upstream pattern in strict mode", () => {
    const samples = [
      "git push -u origin main",
      "gh pr create --fill",
      "gt submit",
      "terraform apply -auto-approve",
      "kubectl delete pod api-0",
      "vercel deploy --prod",
      "rm -rf dist",
      "rm -r build/",
    ];
    for (const command of samples) {
      expect(matchOperation(command, "strict")).toBeDefined();
    }
  });

  it("matches against the whole compound command, like upstream", () => {
    expect(matchOperation("cd app && npm run build && git push", "strict")).toBe("git push");
    expect(matchOperation('echo "git push" >/dev/null', "strict")).toBe("git push");
  });

  it("does not hold non-recursive rm, matching upstream", () => {
    expect(matchOperation("rm -f old.log", "strict")).toBeUndefined();
    expect(matchOperation("cp -r a b", "strict")).toBeUndefined();
  });
});

describe("modes", () => {
  it("external drops local-only patterns and keeps the rest", () => {
    expect(matchOperation("rm -rf dist", "external")).toBeUndefined();
    expect(matchOperation("git push origin main", "external")).toBe("git push");
    expect(matchOperation("gh pr merge 12", "external")).toBe("GitHub pull-request mutation");
  });

  it("off gates nothing", () => {
    for (const command of ["git push", "gh pr create --fill", "rm -rf /tmp/x", "terraform destroy"]) {
      expect(matchOperation(command, "off")).toBeUndefined();
    }
  });

  it("counts patterns per mode", () => {
    expect(activePatterns("strict")).toHaveLength(GATE_PATTERNS.length);
    expect(activePatterns("strict")).toHaveLength(7);
    expect(activePatterns("external")).toHaveLength(6);
    expect(activePatterns("off")).toHaveLength(0);
    expect(activePatterns("external").every((entry) => entry.tier === "external")).toBe(true);
    expect(activePatterns("strict").some((entry) => entry.tier === "local")).toBe(true);
  });

  it("covers every mode in the exported list", () => {
    expect([...CONFIRM_MODES]).toEqual(["strict", "external", "off"]);
    for (const mode of CONFIRM_MODES) expect(isConfirmMode(mode)).toBe(true);
    expect(isConfirmMode("always")).toBe(false);
    expect(isConfirmMode(7)).toBe(false);
  });
});

describe("parseConfirmMode", () => {
  it("accepts the canonical names", () => {
    expect(parseConfirmMode("strict")).toBe("strict");
    expect(parseConfirmMode("external")).toBe("external");
    expect(parseConfirmMode("off")).toBe("off");
  });

  it("accepts the shorthand people type in an env var", () => {
    expect(parseConfirmMode(" OFF ")).toBe("off");
    expect(parseConfirmMode("true")).toBe("strict");
    expect(parseConfirmMode("1")).toBe("strict");
    expect(parseConfirmMode("false")).toBe("off");
    expect(parseConfirmMode("none")).toBe("off");
  });

  it("rejects unknown values instead of silently disabling the gate", () => {
    expect(parseConfirmMode("stric")).toBeUndefined();
    expect(parseConfirmMode("")).toBeUndefined();
    expect(parseConfirmMode("   ")).toBeUndefined();
    expect(parseConfirmMode(undefined)).toBeUndefined();
    expect(parseConfirmMode(0)).toBeUndefined();
  });
});

describe("parseRememberMode", () => {
  it("maps the documented values", () => {
    expect(parseRememberMode("session")).toBe("session");
    expect(parseRememberMode("on")).toBe("session");
    expect(parseRememberMode("always")).toBe("session");
    expect(parseRememberMode("off")).toBe("off");
    expect(parseRememberMode("never")).toBe("off");
    expect(parseRememberMode("sometimes")).toBeUndefined();
    expect(isRememberMode("session")).toBe(true);
    expect(isRememberMode("forever")).toBe(false);
  });
});

describe("resolveConfirmMode", () => {
  it("lets the env override the file in both directions", () => {
    expect(resolveConfirmMode("off", "strict")).toBe("off");
    expect(resolveConfirmMode("strict", "off")).toBe("strict");
    expect(resolveConfirmMode("external", "strict")).toBe("external");
  });

  it("keeps the file's mode when the env is unset or unparseable", () => {
    expect(resolveConfirmMode(undefined, "off")).toBe("off");
    expect(resolveConfirmMode("", "external")).toBe("external");
    expect(resolveConfirmMode("typo", "strict")).toBe("strict");
  });
});

describe("previewCommand", () => {
  it("collapses whitespace", () => {
    expect(previewCommand("  cd app &&\n  git   push  ")).toBe("cd app && git push");
  });

  it("caps the length so a dialog row cannot overflow", () => {
    const long = "x".repeat(400);
    const preview = previewCommand(long, 100);
    expect(preview).toHaveLength(100);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("leaves short commands untouched", () => {
    expect(previewCommand("git push")).toBe("git push");
  });
});
