#!/usr/bin/env bun
// Turns logged Jev decisions into unlabeled cases for your own eval set.
//
//   bun eval/from-log.mjs [decisions.jsonl]... >> ~/.config/jev-guard/cases.jsonl
//
// Then set each new line's "label" to "risky" or "safe"; run.mjs skips lines without one.
// Logged inputs were already redacted and clipped, and the log doesn't keep your prompt, so a case
// made this way is close to the original call, not identical. Add a "user_request" by hand if the
// decision depended on what you had asked for.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir, userDir } from "./lib.mjs";

const home = process.env.HOME;

function defaultLogs() {
  const data = join(home, ".claude", "plugins", "data");
  const logs = existsSync(data)
    ? readdirSync(data).filter((d) => d.startsWith("jev-guard")).map((d) => join(data, d, "decisions.jsonl"))
    : [];
  return [...logs, join(stateDir(home), "decisions.jsonl")].filter(existsSync);
}

const logs = process.argv.length > 2 ? process.argv.slice(2) : defaultLogs();
if (!logs.length) {
  console.error("No decisions.jsonl found. Pass its path.");
  process.exit(2);
}

const known = new Set();
const mine = join(userDir(home), "cases.jsonl");
if (existsSync(mine)) {
  for (const line of readFileSync(mine, "utf8").split("\n")) {
    try {
      known.add(JSON.parse(line).id);
    } catch {}
  }
}

let written = 0;
for (const log of logs) {
  for (const line of readFileSync(log, "utf8").split("\n")) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.source !== "jev" || !e.input || !e.probs) continue;
    const id = `log-${createHash("sha1").update(JSON.stringify([e.tool, e.input])).digest("hex").slice(0, 10)}`;
    if (known.has(id)) continue;
    known.add(id);
    console.log(JSON.stringify({ id, label: null, tool: e.tool, input: e.input, jev: { decision: e.decision, probs: e.probs }, logged: e.ts }));
    written++;
  }
}
console.error(`${written} new case(s) from ${logs.join(", ")}. Label each one "risky" or "safe".`);
