<div align="center">

# ASCII Tree Mod for Claude Code

### Ask a tree with ASCII Tree!

**Turn Claude's long replies into structured trees you can scan at a glance.**

[![License: MIT](https://img.shields.io/badge/license-MIT-8B5A2B.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-mod-C8A165.svg)](https://claude.com/claude-code)
[![Version](https://img.shields.io/badge/version-0.8.0-C27C5B.svg)](ascii-tree/.claude-plugin/plugin.json)

<img src="docs/images/ascii-tree-styled.png" alt="Claude explaining /ascii-tree, drawn as a colored ASCII tree" width="760">

</div>

## Before and after

Each question was asked in two fresh sessions, one with `/ascii-tree` and one without.

**"What's inside a Kubernetes cluster?"**

<img src="docs/images/kubernetes-side-by-side.png" alt="Kubernetes answer as an ASCII tree, next to the plain reply">

The plain reply squeezes each group of API objects into a single comma-separated bullet. The tree gives each group its own branch, and each item has its name highlighted.

**"How is the human nervous system organized?"**

<img src="docs/images/nervous-system-side-by-side.png" alt="Nervous system answer as an ASCII tree, next to the plain reply">

Both replies nest four levels deep. The tree is about half the length, and you can trace each node back to its parent by following the guide lines.

## Features

The feature list below is itself drawn by the mod, so each feature shows up as it's described.

<div align="center">
<img src="docs/images/ascii-tree-features.png" alt="The ascii-tree feature list, drawn by the mod: lineage colors, highlighting, wrapping, the ⚠ ◆ and (recommended) markers, code blocks with copy buttons, and customization" width="566">
</div>

## Install

```sh
claude plugin marketplace add J-Broadway/ascii-tree-mod-for-claude-code
claude plugin install ascii-tree@claude-mods
```

## Usage

Run `/ascii-tree` (or `/tree`), with or without a question. Claude keeps answering as a tree until you tell it to stop.

Commands for you to run come in a code block after the tree, so `/copy` grabs just the commands, without the tree's lines. A command that belongs to one step can sit in the tree itself, drawn as a code block under that step; each is still its own block for `/copy`.

## Customize

Your settings live in `~/.claude/ascii-tree/`, outside the plugin, so updating the mod never overwrites them. Both files are optional, and edits apply to the next tree drawn without a restart.

- `config.json` sets colors per theme and adds, restyles or turns off highlight rules (for example, paths in purple, `prod` in red, no hex swatches).
- `preferences.md` is free-form prose added to the `/tree` and `/ascii-tree` prompt, such as "keep it to three levels".

In `/config`, **Path copy buttons** puts a copy button after each path in fullscreen. `auto` (the default) shows them only where paths aren't clickable links, such as macOS Terminal; `on` shows them everywhere and `off` hides them.

### Highlight markers

A node that starts with a marker gets its opening statement (up to the first colon or full stop) highlighted, across every row it wraps onto. Three are built in, each on a subtle background, and Claude is told when to use each:

- `⚠` critical information, in amber.
- `◆` a decision you must make, in purple, with its options listed beneath it.
- `(recommended)` on the option Claude suggests, in green, across the whole node.

You can add your own markers. Give a rule a `when` and Claude is told when to use it, so one entry in `config.json` sets both how a marker looks and when Claude writes it. A rule can also set a separate style for the light and dark themes:

```json
{
  "highlights": {
    "lock": {
      "match": "^🔒",
      "scope": "lead",
      "when": "a security-sensitive step",
      "style": { "backgroundColor": "#1F2B3A" },
      "light": { "backgroundColor": "#E1EBF7" }
    }
  }
}
```

Every rule name, palette role and style key is listed in [`ascii-tree/CONFIG.md`](ascii-tree/CONFIG.md); ask Claude to read it before it edits your config.

## Develop

```sh
claude plugin validate ascii-tree
claude plugin test ascii-tree
```

## License

[MIT](LICENSE)
