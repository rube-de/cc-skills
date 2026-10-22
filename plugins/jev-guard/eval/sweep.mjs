#!/usr/bin/env bun
// Replays the probabilities run.mjs saved against other deny thresholds, without calling Jev.
//
//   bun eval/sweep.mjs RESULTS.json
//
// For each question that can deny: the highest score a safe case got, so the margin between that
// and the deny threshold is measured rather than guessed, and the lowest deny threshold that still
// blocks no safe case. Decisions come from scripts/verdict.jq itself, so the replay matches the hook.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLUGIN } from "./lib.mjs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: bun eval/sweep.mjs RESULTS.json");
  process.exit(2);
}
const { meta, results } = JSON.parse(readFileSync(file, "utf8"));
const judged = results.filter((r) => r.source === "jev" && r.probs);
if (!judged.length) {
  console.error("No case in these results was judged by Jev.");
  process.exit(2);
}

const basePolicy = JSON.parse(readFileSync(join(PLUGIN, "config", "policy.json"), "utf8"));
const userPolicy = meta.user_policy ?? {};
const scratch = mkdtempSync(join(tmpdir(), "jev-guard-sweep-"));
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));
const body = join(scratch, "body.json");
writeFileSync(body, '{"state":{"tool_call":{"input":null}}}');
const responses = judged
  .map((r) => {
    const answers = Object.fromEntries(Object.entries(r.probs).map(([q, noul]) => [q, { type: "noul", noul }]));
    return JSON.stringify({ model: r.model ?? "replay", answers });
  })
  .join("\n");

function decisions(policy) {
  const jq = Bun.spawnSync(
    ["jq", "-c", "--slurpfile", "policy", join(PLUGIN, "config", "policy.json"), "--argjson", "user", JSON.stringify({ policy }),
      "--slurpfile", "body", body, "--arg", "secs", "", "-f", join(PLUGIN, "scripts", "verdict.jq")],
    { stdin: new Blob([responses]) },
  );
  if (jq.exitCode !== 0) throw new Error(jq.stderr.toString());
  return jq.stdout.toString().trim().split("\n").map((l) => JSON.parse(l).decision);
}

const tally = (ds) => ({
  safeDenied: ds.filter((d, i) => d === "deny" && judged[i].label === "safe").length,
  riskyDenied: ds.filter((d, i) => d === "deny" && judged[i].label === "risky").length,
  riskyStopped: ds.filter((d, i) => d !== "pass" && judged[i].label === "risky").length,
});
const effective = (q) => (userPolicy[q] === null ? null : { ...basePolicy[q], ...(userPolicy[q] ?? {}) });
const pct = (p) => `${Math.round(p * 100)}%`;

const risky = judged.filter((r) => r.label === "risky").length;
const now = tally(decisions(userPolicy));
console.log(
  `${judged.length} cases judged by Jev (${risky} risky, ${judged.length - risky} safe). ` +
    `Current policy: ${now.riskyDenied} risky denied, ${now.riskyStopped} stopped, ${now.safeDenied} safe denied.\n`,
);

for (const q of Object.keys({ ...basePolicy, ...userPolicy })) {
  const current = effective(q)?.deny;
  if (typeof current !== "number") continue;
  const safeScores = judged.filter((r) => r.label === "safe").map((r) => r.probs[q]).filter(Number.isFinite);
  const maxSafe = safeScores.length ? Math.max(...safeScores) : 0;
  let lowest = null;
  for (let t = 50; t <= 99 && !lowest; t++) {
    const s = tally(decisions({ ...userPolicy, [q]: { ...(userPolicy[q] ?? {}), deny: t / 100 } }));
    if (s.safeDenied === 0) lowest = { t: t / 100, ...s };
  }
  console.log(`${q}: denies at ${pct(current)}. Highest safe score ${pct(maxSafe)}, a margin of ${Math.round((current - maxSafe) * 100)} points.`);
  console.log(
    lowest
      ? `  Lowest deny threshold that blocks no safe case: ${pct(lowest.t)} (risky denied there: ${lowest.riskyDenied}, now: ${now.riskyDenied}).`
      : "  Every deny threshold from 50% to 99% blocks a safe case.",
  );
}
console.log("\nA small set overfits: leave room above the highest safe score rather than sitting on it.");
