# Lists what is wrong in config.json as one line, "; "-separated. Invalid settings are ignored.

def one_of($k; $allowed):
  if has($k) and (.[$k] | IN($allowed[]) | not) then "\($k) must be one of \($allowed | join(", "))" else empty end;

def of_type($k; $t; $what):
  if has($k) and (.[$k] | type) != $t then "\($k) must be \($what)" else empty end;

def entries_of($k):
  if has($k) and (.[$k] | type) != "object" then "\($k) must be an object" else (.[$k] // {}) | to_entries[] end;

[
  one_of("mode"; ["shadow", "enforce", "off"]),
  one_of("on_error"; ["open", "ask"]),
  of_type("model"; "string"; "a string"),
  of_type("key_file"; "string"; "a string"),
  of_type("send_user_request"; "boolean"; "true or false"),
  (if has("budget_s") and ((.budget_s | type) != "number" or .budget_s <= 0) then "budget_s must be a number above 0" else empty end),
  (if has("backoff_s") and ((.backoff_s | type) != "number" or .backoff_s < 0) then "backoff_s must be a number from 0" else empty end),
  (entries_of("policy")
    | if type == "string" then .
      elif .value == null then empty
      elif (.value | type) != "object" then "policy.\(.key) must be an object or null"
      else .key as $q | .value | to_entries[]
        | select(.key == "ask" or .key == "deny" or .key == "soften")
        | select((.value | type) != "number" or .value < 0 or .value > 1)
        | "policy.\($q).\(.key) must be a number from 0 to 1"
      end),
  (entries_of("questions")
    | if type == "string" then .
      elif .value == null then empty
      elif (.value | type) != "object" then "questions.\(.key) must be an object or null"
      elif .value.type != "noul" then "questions.\(.key).type must be \"noul\""
      else empty
      end)
] | join("; ")
