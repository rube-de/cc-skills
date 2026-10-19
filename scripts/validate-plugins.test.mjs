import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SCRIPT = join(import.meta.dir, "validate-plugins.mjs");

let root;
afterEach(() => root && rmSync(root, { recursive: true, force: true }));

// A one-plugin marketplace that passes every other check, with the given agent file.
function fixture(agentFrontmatter) {
  root = mkdtempSync(join(tmpdir(), "validate-plugins-"));
  mkdirSync(join(root, ".claude-plugin"));
  writeFileSync(
    join(root, ".claude-plugin/marketplace.json"),
    JSON.stringify({
      name: "fixture",
      version: "1.0.0",
      description: "Fixture marketplace",
      owner: { name: "fixture" },
      plugins: [
        {
          name: "demo",
          description: "A demo plugin for the validator tests",
          version: "1.0.0",
          source: "./plugins/demo",
          category: "development",
        },
      ],
    })
  );
  mkdirSync(join(root, "plugins/demo/agents"), { recursive: true });
  writeFileSync(join(root, "plugins/demo/agents/helper.md"), `---\n${agentFrontmatter}\n---\n\nYou help.\n`);
  return root;
}

function run(...args) {
  const proc = Bun.spawnSync([process.execPath, SCRIPT, ...args]);
  return { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

const validate = (dir) => run("--root", dir);

const CLEAN = `name: helper\ndescription: "Helps."\ntools: Read`;

describe("validate-plugins.mjs agent frontmatter check", () => {
  test("passes a clean plugin agent", () => {
    const { exitCode, stdout } = validate(fixture(CLEAN));
    expect(stdout).toContain("✓ Plugin agent frontmatter valid");
    expect(exitCode).toBe(0);
  });

  for (const field of ["hooks", "mcpServers", "permissionMode", "initialPrompt"]) {
    test(`fails on ${field}, naming the file and field`, () => {
      const { exitCode, stdout } = validate(fixture(`${CLEAN}\n${field}: x`));
      expect(exitCode).toBe(1);
      expect(stdout).toContain(`plugins/demo/agents/helper.md: "${field}" is ignored for plugin agents`);
    });
  }

  test("checks agents in subfolders of agents/", () => {
    const dir = fixture(CLEAN);
    mkdirSync(join(dir, "plugins/demo/agents/review"));
    writeFileSync(join(dir, "plugins/demo/agents/review/security.md"), `---\n${CLEAN}\nhooks: x\n---\n\nYou review.\n`);
    const { exitCode, stdout } = validate(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('plugins/demo/agents/review/security.md: "hooks" is ignored for plugin agents');
  });

  test("fails on frontmatter that is not valid YAML, naming the file", () => {
    const { exitCode, stdout } = validate(fixture(`name: helper\ndescription: "Line one.\n\nLine two."\ntools: Read`));
    expect(exitCode).toBe(1);
    expect(stdout).toContain("plugins/demo/agents/helper.md: frontmatter is not valid YAML");
  });
});

describe("validate-plugins.mjs --root", () => {
  test("accepts --root=<dir>", () => {
    const { exitCode, stdout } = run(`--root=${fixture(`${CLEAN}\nhooks: x`)}`);
    expect(stdout).toContain('"hooks" is ignored');
    expect(exitCode).toBe(1);
  });

  test("rejects --root without a value", () => {
    const { exitCode, stderr } = run("--root");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
  });

  test("rejects a directory without a marketplace", () => {
    root = mkdtempSync(join(tmpdir(), "validate-plugins-"));
    const { exitCode, stderr } = run("--root", root);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("No .claude-plugin/marketplace.json");
  });

  test("rejects unknown flags", () => {
    const { exitCode, stderr } = run("--rot", "x");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
  });
});
