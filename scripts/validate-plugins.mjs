#!/usr/bin/env node

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { resolve, dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

const marketplaceFile = join(rootDir, ".claude-plugin/marketplace.json");
const schemaFile = join(__dirname, "marketplace.schema.json");
const pluginsDir = join(rootDir, "plugins");

let hasErrors = false;

console.log("Validating marketplace.json...");

// Load files
const marketplace = JSON.parse(readFileSync(marketplaceFile, "utf-8"));
const schema = JSON.parse(readFileSync(schemaFile, "utf-8"));

// Remove $schema field to avoid meta-schema validation
delete schema.$schema;
delete schema.$id;

// 1. Schema validation
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
const valid = validate(marketplace);

if (valid) {
  console.log("  ✓ Schema validation passed");
} else {
  console.log("  ✗ Schema validation failed:");
  validate.errors.forEach((err) => {
    const path = err.instancePath || "/";
    const msg = err.message || "unknown error";
    console.log(`    - ${path}: ${msg}`);
  });
  hasErrors = true;
}

// 2. Check source paths exist
const plugins = marketplace.plugins || [];
const missingPaths = [];

plugins.forEach((plugin) => {
  const sourcePath = resolve(rootDir, plugin.source);
  if (!existsSync(sourcePath)) {
    missingPaths.push(plugin.source);
  }
});

if (missingPaths.length === 0) {
  console.log(`  ✓ All ${plugins.length} source paths exist`);
} else {
  console.log("  ✗ Source path missing:");
  missingPaths.forEach((path) => console.log(`    - ${path}`));
  hasErrors = true;
}

// 3. Check for orphaned plugin directories
const registeredDirs = new Set(
  plugins.map((p) => p.source.replace("./plugins/", ""))
);

const actualDirs = existsSync(pluginsDir)
  ? readdirSync(pluginsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  : [];

const orphanedDirs = actualDirs.filter((dir) => !registeredDirs.has(dir));

if (orphanedDirs.length === 0) {
  console.log("  ✓ No orphaned plugin directories");
} else {
  console.log(`  ⚠ Orphaned directories: ${orphanedDirs.join(", ")}`);
  hasErrors = true;
}

// 4. Validate SKILL.md frontmatter
const KEBAB_RE = /^[a-z0-9-]+$/;
const COMPONENT_DIRS = ["skills", "hooks", "commands", "agents"];

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const raw = match[1];

  // Extract name
  const nameMatch = raw.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m);
  const name = nameMatch ? nameMatch[1].trim() : null;

  // Extract description — handles inline, quoted, and block scalars (>- / |)
  let description = null;
  const inlineMatch = raw.match(/^description:\s*["'](.+?)["']\s*$/m);
  const unquotedMatch = raw.match(/^description:\s*([^>|"'\n].+)$/m);
  const blockMatch = raw.match(/^description:\s*[>|]-?\s*\n((?:[ \t]+.+\n?)+)/m);

  if (inlineMatch) {
    description = inlineMatch[1].trim();
  } else if (unquotedMatch) {
    description = unquotedMatch[1].trim();
  } else if (blockMatch) {
    description = blockMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
  }

  return { name, description };
}

let skillErrors = [];

plugins.forEach((plugin) => {
  const pluginDir = resolve(rootDir, plugin.source);
  if (!existsSync(pluginDir)) return; // already caught in step 2

  // Check component dirs
  const hasComponent = COMPONENT_DIRS.some((d) =>
    existsSync(join(pluginDir, d))
  );
  if (!hasComponent) {
    skillErrors.push(
      `${plugin.name}: no component directory (needs skills/, hooks/, commands/, or agents/)`
    );
  }

  // Find and validate SKILL.md files
  const skillsDir = join(pluginDir, "skills");
  if (!existsSync(skillsDir)) return;

  const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const skillDir of skillDirs) {
    const skillFile = join(skillsDir, skillDir, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    const relPath = relative(rootDir, skillFile);
    const content = readFileSync(skillFile, "utf-8");
    const fm = parseFrontmatter(content);

    if (!fm) {
      skillErrors.push(`${relPath}: missing YAML frontmatter`);
      continue;
    }

    if (!fm.name) {
      skillErrors.push(`${relPath}: missing "name" field`);
    } else if (!KEBAB_RE.test(fm.name)) {
      skillErrors.push(
        `${relPath}: name "${fm.name}" is not kebab-case (must match ^[a-z0-9-]+$)`
      );
    }

    if (!fm.description) {
      skillErrors.push(`${relPath}: missing or empty "description" field`);
    }
  }
});

if (skillErrors.length === 0) {
  console.log("  ✓ SKILL.md frontmatter valid");
} else {
  console.log("  ✗ SKILL.md frontmatter issues:");
  skillErrors.forEach((e) => console.log(`    - ${e}`));
  hasErrors = true;
}

// Summary
if (hasErrors) {
  console.log("1 error(s) found.");
  process.exit(1);
} else {
  console.log("All checks passed.");
  process.exit(0);
}
