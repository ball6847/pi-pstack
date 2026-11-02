import { afterAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// getAgentDir() honours PI_CODING_AGENT_DIR, so these assertions run against a
// throwaway agent directory instead of the real ~/.pi/agent.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "pstack-config-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = sandbox;
delete process.env.PI_PSTACK_CONFIRM;

let config: typeof import("./config.ts") | undefined;
try {
  config = await import("./config.ts");
} catch (error) {
  // config.ts imports @earendil-works/pi-coding-agent, a peer dependency.
  // Without `bun install` these cases skip instead of failing the suite.
  console.warn(`skipping confirm-settings assertions: ${error instanceof Error ? error.message : String(error)}`);
}

afterAll(() => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  delete process.env.PI_PSTACK_CONFIRM;
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe("confirm settings file", () => {
  const test = it.skipIf(!config);

  test("defaults to strict/session and writes no file on read", async () => {
    const effective = await config!.readConfirmSettings();
    expect(effective.settings).toEqual({ mode: "strict", remember: "session" });
    expect(effective.source).toBe("default");
    expect(fs.existsSync(config!.confirmConfigPath())).toBe(false);
  });

  test("round-trips a patch through config.json", async () => {
    await config!.writeConfirmSettings({ mode: "external", remember: "off" });
    const effective = await config!.readEffectiveConfirm();
    expect(effective.settings).toEqual({ mode: "external", remember: "off" });
    expect(effective.source).toBe("config");
  });

  test("merges patches without dropping other keys", async () => {
    await config!.writeConfirmSettings({ mode: "off" });
    const raw = JSON.parse(fs.readFileSync(config!.confirmConfigPath(), "utf8")) as {
      confirm: { mode: string; remember: string };
    };
    expect(raw.confirm).toEqual({ mode: "off", remember: "off" });
  });

  test("lets PI_PSTACK_CONFIRM outrank the file", async () => {
    process.env.PI_PSTACK_CONFIRM = "strict";
    let effective = await config!.readEffectiveConfirm();
    expect(effective.settings.mode).toBe("strict");
    expect(effective.source).toBe("env");

    process.env.PI_PSTACK_CONFIRM = "not-a-mode";
    effective = await config!.readEffectiveConfirm();
    expect(effective.settings.mode).toBe("off");
    expect(effective.source).toBe("config");

    delete process.env.PI_PSTACK_CONFIRM;
  });

  test("falls back to safe defaults when config.json is broken", async () => {
    fs.writeFileSync(config!.confirmConfigPath(), "{ not json");
    const effective = await config!.readEffectiveConfirm();
    expect(effective.settings.mode).toBe("strict");
    expect(effective.source).toBe("default");
  });
});
