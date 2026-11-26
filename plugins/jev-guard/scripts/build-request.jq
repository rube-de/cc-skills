# Builds the TypeSafe /v1/systemone request from the PreToolUse hook input on stdin.
# Secrets are masked and long strings clipped before anything leaves the machine.
# config.json's `questions` ($user) replace or add questions by name; null removes one.

def redact:
  gsub("-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)"; "[private key]")
  | gsub("\\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}|\\bgh[pousr]_[A-Za-z0-9]{20,}|\\bgithub_pat_[A-Za-z0-9_]{20,}|\\bAKIA[0-9A-Z]{16}|\\bxox[abprs]-[A-Za-z0-9-]{10,}|\\bAIza[0-9A-Za-z_-]{30,}|\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}"; "[token]")
  | gsub("(?<k>(?i)(api[_-]?key|access[_-]?key|secret|token|passw(or)?d|credential)s?[\"']?\\s*[:=]\\s*[\"']?)[^\\s\"'&;]{6,}"; "\(.k)[value]")
  | gsub("(?<k>(?i)(authorization:\\s*(bearer|basic)\\s+))[^\\s\"']+"; "\(.k)[token]");

def clip($n):
  if length <= $n then .
  else .[0:($n * 3 / 4 | floor)] + " [...] " + .[length - ($n / 4 | floor):]
  end;

def tidy($n): walk(if type == "string" then redact | clip($n) else . end);

def effect:
  if . == "Bash" then "Runs a shell command on the user's computer."
  elif . == "Write" then "Creates or overwrites a file with the given content."
  elif . == "Edit" or . == "MultiEdit" then "Replaces text inside an existing file."
  elif . == "NotebookEdit" then "Changes a cell in a Jupyter notebook."
  elif . == "WebFetch" then "Downloads a web page. The full URL, including any query string, is sent to that host."
  elif startswith("mcp__") then "Calls an external service through a connector (\(split("__")[1])). The input is sent to that service."
  else "A tool provided to the coding assistant."
  end;

{
  model: $model,
  state: {
    tool_call: {
      tool: .tool_name,
      effect: (.tool_name | effect),
      input: (.tool_input | tidy(1500))
    },
    project_directory: $project,
    working_directory: .cwd,
    home_directory: $home,
    facts: {
      in_git_work_tree: $in_git,
      uncommitted_changes: $dirty
    },
    user_request: (if $request == "" then "(unknown)" else ($request | redact | clip(800)) end)
  },
  questions: (
    ($user.questions | if type == "object" then . else {} end) as $mine
    | $questions[0] + $mine
    | with_entries(select(.value | type == "object" and .type == "noul"))
  )
}
