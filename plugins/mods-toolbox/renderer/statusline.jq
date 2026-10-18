# The Status Line Dock's blocks: Claude Code's status line JSON on stdin, the
# Layout in $layout, and what statusline.sh gathered (git, the Agent Dock's
# count, the last skill, the Base status line's output) as arguments. Prints the status line,
# or under $preview one JSON object the Dock's preview reads.
#
# Width is counted here, in terminal cells, because sh counts bytes in the C locale.

def color($code; $text):
  if $color == "1" then "\u001b[\($code)m\($text)\u001b[0m" else $text end;

def icon_table: {
  glyph: { folder: "⌂", branch: "⎇", model: "◆", effort: "◎", style: "✎", time: "◷", limits: "◔", cache: "⟳", agents: "◇", skill: "✦" },
  emoji: {
    folder: "📁", branch: "🌿", model: "🤖", effort: "💭", version: "📟", style: "🎨",
    context: "🧠", cost: "💰", lines: "📝", time: "⌛", limits: "📊", cache: "💾", agents: "👥", skill: "⚡"
  }
};

# Every emoji above is drawn two cells wide; every glyph one.
def icon_width($style): if $style == "emoji" then 2 else 1 end;

# The cells a character takes, as wcwidth counts them for the common cases.
# Codepoint ranges in decimal, since jq has no hex: combining marks, joiners and
# variation selectors take none; CJK, Hangul, fullwidth forms and every emoji
# Unicode draws as emoji by default take two. The icons above keep icon_width.
def zero_ranges: [
    [768, 879], [8203, 8207], [8400, 8447], [65024, 65039], [917760, 917999]
  ];

def wide_ranges: [
    [4352, 4447], [8986, 8987], [9193, 9196], [9200, 9200], [9203, 9203], [9725, 9726],
    [9748, 9749], [9800, 9811], [9855, 9855], [9875, 9875], [9889, 9889], [9898, 9899],
    [9917, 9918], [9924, 9925], [9934, 9934], [9940, 9940], [9962, 9962], [9970, 9971],
    [9973, 9973], [9978, 9978], [9981, 9981], [9989, 9989], [9994, 9995], [10024, 10024],
    [10060, 10060], [10062, 10062], [10067, 10069], [10071, 10071], [10133, 10135], [10160, 10160],
    [10175, 10175], [11035, 11036], [11088, 11088], [11093, 11093], [11904, 42191], [44032, 55203],
    [63744, 64255], [65040, 65049], [65072, 65135], [65280, 65376], [65504, 65510], [127744, 129791],
    [131072, 262141]
  ];

def in_ranges($ranges): . as $c | any($ranges[]; $c >= .[0] and $c <= .[1]);

def cell_width: if in_ranges(zero_ranges) then 0 elif in_ranges(wide_ranges) then 2 else 1 end;

# Each codepoint's cells, in context: VS16 (65039) turns the narrow symbol
# before it into a two-wide emoji, as in "❤️".
def widths:
  . as $cs
  | [range(0; length) as $i
      | if $cs[$i] == 65039 and $i > 0 and ($cs[$i - 1] | cell_width) == 1 then 1 else $cs[$i] | cell_width end];

def cells: explode | widths | add // 0;

# The end of a string, at most $max cells wide, never starting on a mark that
# belongs to the character before the cut.
def last_cells($max):
  explode as $cs
  | ($cs | widths) as $ws
  | reduce range(($cs | length) - 1; -1; -1) as $i ({ start: ($cs | length), used: 0, full: false };
      if .full then .
      elif .used + $ws[$i] > $max then .full = true
      else .start = $i | .used += $ws[$i] end)
  | .start
  | until(. >= ($cs | length) or ($cs[.] | cell_width) > 0; . + 1)
  | $cs[.:] | implode;

# The start of a string, with "…" when it is cut to fit $max cells.
def first_cells($max):
  if cells <= $max then .
  else
    explode as $cs
    | ($cs | widths) as $ws
    | reduce range(0; $cs | length) as $i ({ end: 0, used: 0, full: false };
        if .full then .
        elif .used + $ws[$i] > $max - 1 then .full = true
        else .end = $i + 1 | .used += $ws[$i] end)
    | ($cs[:.end] | implode) + "…"
  end;

def two_digits: tostring | if length < 2 then "0" + . else . end;

def money:
  (. * 100 | round) as $cents
  | "$\($cents / 100 | floor).\($cents % 100 | two_digits)";

def duration:
  (. / 1000 | floor) as $s
  | if $s >= 3600 then "\($s / 3600 | floor)h\($s % 3600 / 60 | floor)m"
    elif $s >= 60 then "\($s / 60 | floor)m\($s % 60)s"
    else "\($s)s" end;

# Seconds still to go, short: "3d4h", "2h10m", "47m", "45s".
def countdown:
  floor as $s
  | if $s >= 86400 then "\($s / 86400 | floor)d\($s % 86400 / 3600 | floor)h"
    elif $s >= 3600 then "\($s / 3600 | floor)h\($s % 3600 / 60 | floor)m"
    elif $s >= 60 then "\($s / 60 | floor)m"
    else "\($s)s" end;

# A prompt cache's "1h" or "5m" in seconds; an hour when it reads otherwise.
def ttl_seconds:
  (capture("^(?<n>[0-9]+)(?<unit>[smhd])$")? // null) as $ttl
  | if $ttl == null then 3600
    else ($ttl.n | tonumber) * ({ s: 1, m: 60, h: 3600, d: 86400 }[$ttl.unit]) end;

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
    # Each window's reset shows while it is still ahead.
    (now | floor) as $now
    | [
        ($input.rate_limits.five_hour // null | { label: "5h", used: .used_percentage?, resets: .resets_at? }),
        ($input.rate_limits.seven_day // null | { label: "7d", used: .used_percentage?, resets: .resets_at? })
      ]
    | map(select(.used != null)) as $windows
    | if ($windows | length) == 0 then null
      else {
        plain: ($windows
          | map("\(.label) \(.used | percent)"
            + (if (.resets | type) == "number" and .resets > $now then " ↺\(.resets - $now | countdown)" else "" end))
          | join(" · ")),
        code: (if ($windows | map(.used) | max) >= 80 then "38;5;215" else "38;5;110" end)
      } end
  elif $id == "cache" then
    # Warm: the time left, amber in the last sixth of its TTL. Cold once it lapsed.
    (now | floor) as $now
    | ($input.prompt_cache // null) as $cache
    | if ($cache | type) != "object" or $cache.caching_observed == false or ($cache.expires_at | type) != "number" then null
      else ($cache.expires_at - $now) as $left
        | if $cache.warm == true and $left >= 1 then
            { plain: "cache \($left | countdown)", code: (if $left <= ($cache.ttl // "" | ttl_seconds) / 6 then "38;5;215" else "38;5;158" end) }
          else { plain: "cache cold", code: "38;5;245" } end
      end
  elif $id == "agents" then
    ($agents | tonumber? // 0) as $count
    | if $count <= 0 then null
      else { plain: "\($count) agent\(if $count == 1 then "" else "s" end)", code: "38;5;209" } end
  elif $id == "skill" then
    # The skill the main conversation ran last: bright while its turn runs, gray after.
    ($skill | fromjson? // null) as $ran
    | ($ran | if type == "object" and (.name | type) == "string" then .name | gsub("[[:cntrl:]]"; "") else "" end) as $name
    | if $name == "" then null
      else { plain: ($name | first_cells(32)), code: (if $ran.isRunning == true then "38;5;81" else "38;5;245" end) } end
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
