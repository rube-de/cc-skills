# The Status Line Dock draws through a shell renderer, not the mod

Mods can't draw Claude Code's status line: the function-hook API has no status line component or hook, and `$.ui.status` pins a line under the prompt behind the engine's warning glyph. So the Status Line Dock never draws the status line itself. A POSIX sh + jq renderer reads the Layout file and Claude Code's stdin JSON and prints the lines. `settings.json` points `statusLine.command` at it once, at install. After that, the Dock only writes the Layout file.

## Considered Options

- **A JS renderer (node or bun).** It would share block code with the TypeScript preview, but neither runtime is guaranteed on a user's PATH, and node starts in about 30 ms on every refresh. jq ships with macOS 15 and is a common Linux package.
- **Re-implementing the blocks in TypeScript for the preview.** Two renderers drift apart. The preview runs the real renderer through `$.process.run` with fabricated or captured stdin, and turns its ANSI colors into `Text` props.
- **Keeping the Layout in `$.store`.** The store's filename carries a source and a hash that a shell script can't predict, so the Layout gets its own file under the config directory.

## Consequences

- The plugin's install path carries its version (`…/mods-toolbox/2.18.0`), so `settings.json` can't point into it. The mod copies the renderer to a stable path under the config directory on every session start, and plugin updates reach it that way.
- The installed status line keeps working after the plugin is uninstalled, since the renderer and Layout are plain files. Only the Agents block goes blank, because nothing writes the count file anymore.
- Without jq, the renderer prints one plain hint line instead of guessing at JSON with sed.
