# Maps Jev's answers to deny / ask / pass using config/policy.json, with config.json's `policy`
# ($user) laid over it: a question's fields merge, null removes the question's policy.
# Inputs: the API response on stdin, $policy and $body (slurped files), $user, $secs (curl time).

if (.answers | type) != "object" then error("response has no answers") else . end
| (
    ($user.policy | if type == "object" then . else {} end) as $mine
    | reduce ($mine | to_entries[]) as $e ($policy[0];
        if $e.value == null then del(.[$e.key])
        elif ($e.value | type) == "object" then .[$e.key] = ((.[$e.key] // {}) + $e.value)
        else .
        end)
  ) as $p
| (.answers | with_entries(.value |= .noul)) as $probs
| def at($t; $k): $t[$k] | if type == "number" then . else null end;
  [
    $probs | to_entries[]
    | select((.value | type) == "number" and $p[.key] != null)
    | . as $e
    | $p[.key] as $t
    | ($t.label // $e.key) as $label
    | if at($t; "deny") != null and $e.value >= at($t; "deny") then {level: 2, label: $label, p: $e.value}
      elif at($t; "ask") != null and $e.value >= at($t; "ask") then {level: 1, label: $label, p: $e.value}
      else empty
      end
  ] as $hits
| [
    # A "soften" question (user_requested) turns a Jev deny into an ask. It never passes a call.
    $probs | to_entries[]
    | select((.value | type) == "number" and $p[.key] != null)
    | . as $e
    | $p[.key] as $t
    | select(at($t; "soften") != null and $e.value >= at($t; "soften"))
    | {label: ($t.label // $e.key), p: $e.value}
  ] as $soft
| (if any($hits[]; .level == 2) then "deny" elif ($hits | length) > 0 then "ask" else "pass" end) as $base
| ($base == "deny" and ($soft | length) > 0) as $softened
| def pct: "\(.label) (\(.p * 100 | round)%)";
  {
    model: .model,
    probs: $probs,
    latency_s: ($secs | tonumber? // null),
    input: $body[0].state.tool_call.input,
    decision: (if $softened then "ask" else $base end),
    why: (
      ($hits | sort_by(-.p) | map(pct) | join(", "))
      + (if $softened then "; asking instead of blocking: \($soft | map(pct) | join(", "))" else "" end)
    )
  }
