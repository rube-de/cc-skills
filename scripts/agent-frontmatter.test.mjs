import { describe, expect, test } from "bun:test";
import { IGNORED_PLUGIN_AGENT_FIELDS, agentFrontmatterErrors } from "./agent-frontmatter.mjs";

const agent = (frontmatter) => `---\n${frontmatter}\n---\n\nYou are a test agent.\n`;

const CLEAN = `name: reviewer
description: "Reviews code.\\n\\n<example>\\nContext: a diff.\\n</example>"
tools: Read, Grep, mcp__context7__*
model: sonnet
maxTurns: 15`;

describe("agentFrontmatterErrors", () => {
  test("accepts a clean agent", () => {
    expect(agentFrontmatterErrors(agent(CLEAN), "agents/reviewer.md")).toEqual([]);
  });

  for (const field of IGNORED_PLUGIN_AGENT_FIELDS) {
    test(`flags ${field}, naming the file and field`, () => {
      const errors = agentFrontmatterErrors(agent(`${CLEAN}\n${field}: x`), "agents/reviewer.md");
      expect(errors).toHaveLength(1);
      expect(errors[0]).toStartWith("agents/reviewer.md:");
      expect(errors[0]).toContain(`"${field}"`);
    });
  }

  test("flags a nested hooks block", () => {
    const hooks = `hooks:\n  PostToolUse:\n    - matcher: "Bash"\n      hooks:\n        - type: command\n          command: "x.sh"`;
    const errors = agentFrontmatterErrors(agent(`${CLEAN}\n${hooks}`), "agents/a.md");
    expect(errors).toEqual([expect.stringContaining('"hooks"')]);
  });

  test("flags every ignored field present", () => {
    const fm = `${CLEAN}\npermissionMode: bypassPermissions\nmcpServers: context7`;
    expect(agentFrontmatterErrors(agent(fm), "agents/a.md")).toHaveLength(2);
  });

  // The shape that broke cdt's researcher: a multi-line double-quoted
  // description whose continuation lines start at column 0.
  test("flags frontmatter that is not valid YAML, naming the file", () => {
    const fm = `name: researcher\ndescription: "First line.\n\n<example>\nContext: x\n</example>"\ntools: Read`;
    const errors = agentFrontmatterErrors(agent(fm), "agents/researcher.md");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toStartWith("agents/researcher.md:");
    expect(errors[0]).toContain("not valid YAML");
  });

  test("flags a missing frontmatter block", () => {
    expect(agentFrontmatterErrors("You are an agent.\n", "agents/a.md")).toEqual([
      "agents/a.md: missing YAML frontmatter",
    ]);
  });

  test("flags frontmatter that is not a mapping", () => {
    expect(agentFrontmatterErrors(agent("- just\n- a list"), "agents/a.md")).toEqual([
      "agents/a.md: frontmatter is not a YAML mapping",
    ]);
  });

  test("flags an empty frontmatter block without reading the body as frontmatter", () => {
    const content = "---\n---\n\nhooks: body text\n---\n";
    expect(agentFrontmatterErrors(content, "agents/a.md")).toEqual(["agents/a.md: frontmatter is empty"]);
  });

  test("doesn't close the block on a line that only starts with ---, so fields after it aren't skipped", () => {
    const content = `---\n${CLEAN}\n---suffix\nhooks: x\n---\n`;
    expect(agentFrontmatterErrors(content, "agents/a.md")).toEqual([expect.stringContaining("not valid YAML")]);
  });

  describe("CRLF and BOM files", () => {
    const crlf = (text) => text.replaceAll("\n", "\r\n");

    test("accepts a clean CRLF agent", () => {
      expect(agentFrontmatterErrors(crlf(agent(CLEAN)), "agents/a.md")).toEqual([]);
    });

    test("flags an ignored field in a CRLF agent", () => {
      const errors = agentFrontmatterErrors(crlf(agent(`${CLEAN}\nhooks: x`)), "agents/a.md");
      expect(errors).toEqual([expect.stringContaining('"hooks"')]);
    });

    test("flags broken YAML in a CRLF agent", () => {
      const errors = agentFrontmatterErrors(crlf(agent(`name: a\ndescription: "One.\n\nTwo."`)), "agents/a.md");
      expect(errors).toEqual([expect.stringContaining("not valid YAML")]);
    });

    test("reads frontmatter after a UTF-8 BOM", () => {
      expect(agentFrontmatterErrors(`﻿${agent(`${CLEAN}\nhooks: x`)}`, "agents/a.md")).toEqual([
        expect.stringContaining('"hooks"'),
      ]);
    });
  });
});
