// Checks the frontmatter of an agent shipped in a plugin.
//
// Claude Code ignores these fields for plugin agents (docs: Plugin components → Agents):
// an agent file can't add hooks, MCP servers or a permission mode on its own.
const FIX_HINTS = {
  hooks: "register the hook in the plugin's hooks/hooks.json instead",
  mcpServers:
    "declare the server in the plugin's .mcp.json and grant its tools in `tools` as mcp__plugin_<plugin>_<server>__* (mcp__<server>__* only matches a server the user configured)",
  permissionMode: "a plugin agent can't set its permission mode; remove it",
  initialPrompt: "remove it",
};

export const IGNORED_PLUGIN_AGENT_FIELDS = Object.keys(FIX_HINTS);

// Parsed with Bun.YAML because `claude plugin validate` prints its error text verbatim,
// so it accepts and rejects what Claude Code does. Don't swap in js-yaml (in node_modules
// transitively): it accepts the column-0 continuation lines that broke cdt's researcher.
// Frontmatter that fails to parse loads with every field dropped, so a lenient parser
// here would hide exactly the failure that matters.
export function agentFrontmatterErrors(content, relPath) {
  const match = content.match(/^\uFEFF?---\r?\n(?:([\s\S]*?)\r?\n)??---[ \t]*(?:\r?\n|$)/);
  if (!match) return [`${relPath}: missing YAML frontmatter`];

  let frontmatter;
  try {
    frontmatter = Bun.YAML.parse(match[1] ?? "");
  } catch (err) {
    return [
      `${relPath}: frontmatter is not valid YAML (${err.message}); Claude Code would load this agent with every field dropped`,
    ];
  }

  if (frontmatter === null) return [`${relPath}: frontmatter is empty`];
  if (typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    return [`${relPath}: frontmatter is not a YAML mapping`];
  }

  return IGNORED_PLUGIN_AGENT_FIELDS.filter((field) => Object.hasOwn(frontmatter, field)).map(
    (field) => `${relPath}: "${field}" is ignored for plugin agents; ${FIX_HINTS[field]}`
  );
}
