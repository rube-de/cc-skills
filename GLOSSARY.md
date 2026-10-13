# cc-skills

Claude Code plugins published from one marketplace. Terms below are the ones that name things users see or that more than one plugin file relies on.

## Mods Toolbox

**Toolbox**:
The popup above the prompt, opened from **◆ Toolbox ▾** in the prompt footer, that holds Claude's model config, the mods' settings and the Launch entries for Docks.
_Avoid_: toolbox mode, settings popup, menu

**Dock**:
A working area opened from the Toolbox's Launch section, for one job that needs more room than a Toolbox row.
_Avoid_: panel, window, sidebar, pane

**Agent Dock**:
The Dock that splits each request across a Team Size of parallel helpers and shows each helper as a live card.
_Avoid_: the dock (once there is more than one)

**Status Line Dock**:
The Dock where the status line is put together from Blocks, with a preview, and installed globally or for one project.
_Avoid_: status line editor, statusline configurator

### Status line

**Status line**:
Claude Code's own row under the prompt, printed by the command set as `statusLine` in a settings file.
_Avoid_: status bar, footer

**Block**:
One selectable piece of status line content, such as the model, the git branch or the cost, that can be turned on, moved and put on a line.
_Avoid_: segment, widget, module

**Layout**:
The saved choice of mode, which Blocks are on, their order, the line each sits on, and the icon style. Each install scope has its own.
_Avoid_: config, preset, theme

**Replace**:
The mode where the Blocks are the whole status line.

**Extend**:
The mode where the Base status line stays and the Blocks add up to two lines below it.
_Avoid_: append, wrap, keep

**Base status line**:
The status line that was in force before the Status Line Dock was installed, kept on top in Extend mode and put back on uninstall.
_Avoid_: current status line, own status line, original
