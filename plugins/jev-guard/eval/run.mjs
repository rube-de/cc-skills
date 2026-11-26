#!/usr/bin/env bun
// Scores jev-guard on labeled cases, through the real hook and the real Jev API.
//
//   bun eval/run.mjs [--cases FILE]... [--no-default-cases] [--only TEXT] [--out FILE] [--concurrency N] [--keep]
//
// Runs the shipped seed cases plus ~/.config/jev-guard/cases.jsonl. Each case gets its own session
// and data folder, so one case's back-off or note can't leak into the next. Exits 1 when a safe case
// is blocked, a case misses its exact `expect`, or any case errors; 2 when the setup can't reach Jev.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { HOOK, SEED_CASES, failed, fill, grade, loadCases, outcome, report, stateDir, summarize, userDir } from "./lib.mjs";

const { values: opts } = parseArgs({
  options: {
    cases: { type: "string", multiple: true, default: [] },
    "no-default-cases": { type: "boolean", default: false },
    only: { type: "string" },
    out: { type: "string" },
    concurrency: { type: "string", default: "4" },
    keep: { type: "boolean", default: false },
  },
});

const home = process.env.HOME;
const files = [];
if (!opts["no-default-cases"]) {
  files.push(SEED_CASES);
  const mine = join(userDir(home), "cases.jsonl");
  if (existsSync(mine)) files.push(mine);
}
files.push(...opts.cases);

const { cases: all, unlabeled, problems } = loadCases(files);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(2);
}
const cases = opts.only ? all.filter((c) => c.id.includes(opts.only)) : all;
if (!cases.length) {
  console.error("No labeled cases to run.");
  process.exit(2);
}

const configPath = process.env.JEV_GUARD_CONFIG ?? join(userDir(home), "config.json");
let userConfig = {};
try {
  userConfig = JSON.parse(readFileSync(configPath, "utf8"));
} catch {}
const budgetS = Number(process.env.JEV_GUARD_BUDGET_S ?? userConfig.budget_s ?? 1.5);

// Each case's transcript, data folder and the two test repos live here; --keep leaves them to inspect.
const work = mkdtempSync(join(tmpdir(), "jev-guard-eval-"));
process.on("exit", () => {
  if (opts.keep) console.error(`Kept case folders in ${work}`);
  else rmSync(work, { recursive: true, force: true });
});
const git = (dir, ...args) => {
  const r = Bun.spawnSync(["git", "-C", dir, ...args]);
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
};
function project(name, dirty) {
  const dir = join(work, name);
  mkdirSync(dir);
  git(dir, "init", "-q");
  writeFileSync(join(dir, "app.js"), "console.log('hi')\n");
  git(dir, "add", "app.js");
  git(dir, "-c", "user.name=eval", "-c", "user.email=eval@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "init");
  if (dirty) writeFileSync(join(dir, "app.js"), "console.log('changed')\n");
  return dir;
}
const projects = { clean: project("clean", false), dirty: project("dirty", true) };

let next = 0;
async function runCase(c) {
  const n = next++;
  const dir = join(work, `case-${n}`);
  mkdirSync(dir);
  const cwd = c.dirty ? projects.dirty : projects.clean;
  const transcript = join(dir, "transcript.jsonl");
  const prompt = c.user_request ? { type: "user", message: { role: "user", content: c.user_request } } : null;
  writeFileSync(transcript, prompt ? `${JSON.stringify(prompt)}\n` : "");
  const proc = Bun.spawn(["bash", HOOK], {
    stdin: new Blob([
      JSON.stringify({
        session_id: `eval-${n}`,
        tool_name: c.tool,
        tool_input: fill(c.input, { project: cwd, home }),
        cwd,
        transcript_path: transcript,
      }),
    ]),
    stdout: "pipe",
    stderr: "ignore",
    env: {
      ...process.env,
      CLAUDE_PLUGIN_DATA: join(dir, "data"),
      CLAUDE_PROJECT_DIR: cwd,
      JEV_GUARD_MODE: "enforce",
      JEV_GUARD_USER_REQUEST: "1",
      JEV_GUARD_BACKOFF_S: "0",
    },
  });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  const log = join(dir, "data", "decisions.jsonl");
  const lines = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const r = outcome(stdout, lines.at(-1));
  return { id: c.id, label: c.label, expect: c.expect, tool: c.tool, why: c.why, ...r, grade: grade(c, r) };
}

// One call first: a missing key or a wrong URL would otherwise make every case "pass".
const probe = await runCase({ id: "preflight", label: "safe", tool: "Bash", input: { command: "npm test" } });
if (probe.source !== "jev") {
  console.error(`Preflight failed: the hook did not get an answer from Jev (${probe.error ?? probe.message ?? probe.source}).`);
  process.exit(2);
}

const results = new Array(cases.length);
let cursor = 0;
await Promise.all(
  Array.from({ length: Math.max(1, Number(opts.concurrency) || 4) }, async () => {
    while (cursor < cases.length) {
      const i = cursor++;
      results[i] = await runCase(cases[i]);
    }
  }),
);

const summary = summarize(results);
console.log(report(summary, results, budgetS));
if (unlabeled) console.log(`\n${unlabeled} unlabeled case(s) skipped. Set "label" to "risky" or "safe" to include them.`);

const out = opts.out ?? join(stateDir(home), "eval", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `${JSON.stringify(
    { meta: { date: new Date().toISOString(), model: probe.model, budget_s: budgetS, files, user_policy: userConfig.policy ?? {} }, summary, results },
    null,
    2,
  )}\n`,
);
console.log(`\nResults: ${out}\nReplay other thresholds without new calls: bun ${join(import.meta.dir, "sweep.mjs")} ${out}`);

process.exit(failed(summary) ? 1 : 0);
