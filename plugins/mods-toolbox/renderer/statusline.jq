# The Status Line Dock's blocks: Claude Code's status line JSON on stdin, the
# Layout in $layout, and what statusline.sh gathered (git, the Agent Dock's
# count, the Base status line's output) as arguments. Prints the status line,
# or under $preview one JSON object the Dock's preview reads.
#
# Width is counted here, in terminal cells, because sh counts bytes in the C locale.

def color($code; $text):
  if $color == "1" then "\u001b[\($code)m\($text)\u001b[0m" else $text end;

def icon_table: {
  glyph: { folder: "⌂", branch: "⎇", model: "◆", effort: "◎", style: "✎", time: "◷", limits: "◔", agents: "◇" },
  emoji: {
    folder: "📁", branch: "🌿", model: "🤖", effort: "💭", version: "📟", style: "🎨",
    context: "🧠", cost: "💰", lines: "📝", time: "⌛", limits: "📊", agents: "👥"
  }
};

# Every emoji above is drawn two cells wide; every glyph one.
def icon_width($style): if $style == "emoji" then 2 else 1 end;

# The cells one codepoint takes, as wcwidth counts them for the common cases:
# combining marks, joiners and variation selectors none; CJK, Hangul,
# fullwidth forms and emoji two. The icons above keep icon_width.
def cell_width:
  if (. >= 768 and . <= 879) or (. >= 8203 and . <= 8207) or (. >= 8400 and . <= 8447)
    or (. >= 65024 and . <= 65039) or (. >= 917760 and . <= 917999) then 0
  elif (. >= 4352 and . <= 4447) or (. >= 11904 and . <= 42191) or (. >= 44032 and . <= 55203)
    or (. >= 63744 and . <= 64255) or (. >= 65040 and . <= 65049) or (. >= 65072 and . <= 65135)
    or (. >= 65280 and . <= 65376) or (. >= 65504 and . <= 65510)
    or (. >= 127744 and . <= 129791) or (. >= 131072 and . <= 262141) then 2
  else 1 end;

def cells: explode | map(cell_width) | add // 0;

# The end of a string, at most $max cells wide.
def last_cells($max):
  explode | reverse
  | reduce .[] as $c ({ kept: [], used: 0, full: false };
      if .full then .
      else ($c | cell_width) as $w
        | if .used + $w > $max then .full = true else .kept += [$c] | .used += $w end
      end)
  | .kept | reverse | implode;

def two_digits: tostring | if length < 2 then "0" + . else . end;

def money:
  (. * 100 | round) as $cents
  | "$\($cents / 100 | floor).\($cents % 100 | two_digits)";

def duration:
  (. / 1000 | floor) as $s
  | if $s >= 3600 then "\($s / 3600 | floor)h\($s % 3600 / 60 | floor)m"
    elif $s >= 60 then "\($s / 60 | floor)m\($s % 60)s"
    else "\($s)s" end;

def percent: round | tostring + "%";

def bar($used):
  ($used / 10 | round | if . > 10 then 10 elif . < 0 then 0 else . end) as $full
  | ("█" * $full) + ("░" * (10 - $full));

def shorten_home:
  if $home != "" and (startswith($home + "/") or . == $home) then "~" + .[($home | length):] else . end;

# At most $max wide: the front goes, and whole folders from the end stay after ".../".
def cut_front($max):
  if cells <= $max then .
  else
    split("/") as $parts
    | reduce range(($parts | length) - 2; 0; -1) as $i ({ kept: $parts[-1], full: false };
        if .full then .
        else "\($parts[$i])/\(.kept)" as $longer
          | if ($longer | cells) + 4 > $max then .full = true else .kept = $longer end
        end)
    | .kept as $kept
    | if ($kept | cells) + 4 <= $max then ".../" + $kept else "..." + ($kept | last_cells($max - 3)) end
  end;

# "Opus 5.5 (1M context)" reads "Opus 5.5(1M)".
def short_model: sub(" \\((?<size>[^()]+) context\\)$"; "(\(.size))");

# One block as { id, text, width }, or null when Claude Code sent nothing for it.
def block($id; $input):
  if $id == "folder" then
    ($input.workspace.current_dir // $input.cwd // null) as $dir
    | if $dir == null then null else { plain: ($dir | shorten_home | cut_front(30)), code: "38;5;117" } end
  elif $id == "branch" then
    if $git_branch == "" then null
    else { plain: $git_branch, code: "38;5;150", tail: (if $git_dirty == "1" then " ✗" else "" end), tail_code: "38;5;203" } end
  elif $id == "model" then
    ($input.model.display_name // $input.model.id // null) as $name
    | if $name == null then null else { plain: ($name | short_model), code: "38;5;147" } end
  elif $id == "effort" then
    ($input.effort.level // null) as $level
    | if $level == null then null else { plain: $level, code: "38;5;183" } end
  elif $id == "version" then
    ($input.version // null) as $version
    | if $version == null then null else { plain: "v\($version)", code: "38;5;249" } end
  elif $id == "style" then
    ($input.output_style.name // null) as $name
    | if $name == null then null else { plain: $name, code: "38;5;245" } end
  elif $id == "context" then
    ($input.context_window.used_percentage // null) as $used
    | if $used == null then null
      else {
        plain: "\(bar($used)) \($used | percent)",
        code: (if $used >= 80 then "38;5;203" elif $used >= 60 then "38;5;215" else "38;5;158" end)
      } end
  elif $id == "cost" then
    ($input.cost.total_cost_usd // null) as $usd
    | if $usd == null then null else { plain: ($usd | money), code: "38;5;222" } end
  elif $id == "lines" then
    ($input.cost.total_lines_added // 0) as $added
    | ($input.cost.total_lines_removed // 0) as $removed
    | if $added == 0 and $removed == 0 then null
      else { plain: "+\($added)", code: "38;5;150", tail: " -\($removed)", tail_code: "38;5;203" } end
  elif $id == "time" then
    ($input.cost.total_duration_ms // null) as $ms
    | if $ms == null or $ms == 0 then null else { plain: ($ms | duration), code: "38;5;245" } end
  elif $id == "limits" then
    [
      ($input.rate_limits.five_hour.used_percentage // null | if . == null then empty else { label: "5h", used: . } end),
      ($input.rate_limits.seven_day.used_percentage // null | if . == null then empty else { label: "7d", used: . } end)
    ] as $windows
    | if ($windows | length) == 0 then null
      else {
        plain: ($windows | map("\(.label) \(.used | percent)") | join(" · ")),
        code: (if ($windows | map(.used) | max) >= 80 then "38;5;215" else "38;5;110" end)
      } end
  elif $id == "agents" then
    ($agents | tonumber? // 0) as $count
    | if $count <= 0 then null
      else { plain: "\($count) agent\(if $count == 1 then "" else "s" end)", code: "38;5;209" } end
  else null end
  | if . == null then null
    else
      (icon_table | .[$layout.icons // "glyph"] // {} | .[$id] // "") as $icon
      | (.tail // "") as $tail
      | {
          id: $id,
          text: ((if $icon == "" then "" else $icon + " " end) + color(.code; .plain) + (if $tail == "" then "" else color(.tail_code; $tail) end)),
          width: ((if $icon == "" then 0 else icon_width($layout.icons // "glyph") + 1 end) + (.plain | cells) + ($tail | cells))
        }
    end;

# The longest run of blocks from the start that fits; the rest drop.
def fit($limit):
  reduce .[] as $b ({ kept: [], dropped: [], used: 0 };
    (if (.kept | length) == 0 then $b.width else .used + 2 + $b.width end) as $next
    | if ($limit > 0 and $next > $limit) or (.dropped | length) > 0
      then .dropped += [$b.id]
      else .kept += [$b] | .used = $next end);

. as $input
| ($columns | tonumber? // 0) as $cols
| (if $cols > 2 then $cols - 2 else 0 end) as $limit
| [($layout.lines // [])[] | map(block(.; $input)) | map(select(. != null)) | fit($limit)] as $lines
| ($lines | map(select((.kept | length) > 0) | .kept | map(.text) | join("  "))) as $blocks
| (if ($layout.mode // "replace") == "extend" and $base != "" then $base | split("\n") else [] end) as $base_lines
| if $preview == "1" then
    { base: $base_lines, lines: $blocks, dropped: ($lines | map(.dropped) | add // []) }
  else
    ($base_lines + $blocks)[]
  end
