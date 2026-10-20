# claude-mods

Mods (hook plugins) for [Claude Code](https://claude.com/claude-code).

## Install

```sh
claude plugin marketplace add <owner>/claude-mods
claude plugin install ascii-tree@claude-mods
```

## ascii-tree

Draws the ASCII trees in Claude's replies in a color palette, where each guide line takes the color of the parent it belongs to. Labels are highlighted: paths, commands, numbers, quotes and `key: value` leaves. Long lines wrap under their own branch, and the guide lines run on unbroken.

- On a light theme (`light`, `light-daltonized`, `light-ansi`) the tree uses a darker version of the palette where every color reaches 4.5:1 contrast on white. Other themes use the original palette.
- Absolute and `~/` paths become clickable `file://` links, so a directory opens in the file manager. In Cursor and VS Code terminals they are left as plain text, because those terminals already link paths and open them in the editor. A relative path (`hooks/lib.ts`) links too when that file exists under the session's working directory. A path with spaces is drawn and linked as one path when it's in quotes or backticks, or when its spaces are escaped (`My\ Files`).
- `/ascii-tree` (alias `/tree`) tells Claude to answer as a tree in the format the mod expects. The mode stays on until you tell Claude to stop.

## Develop

```sh
claude plugin validate ascii-tree
claude plugin test ascii-tree
```

## License

MIT
