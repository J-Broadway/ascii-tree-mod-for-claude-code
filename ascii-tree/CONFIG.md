# ascii-tree user configuration

Two optional files in `~/.claude/ascii-tree/` (outside the plugin, so updates never overwrite them):

- `config.json`: palette overrides and highlight rules (this document).
- `preferences.md`: free-form prose. If it exists and is non-empty, it is appended to the `/tree` and `/ascii-tree` prompt under "User preferences (these override the defaults above)" (first 8000 characters).

A missing file means the built-in look. Invalid input never breaks a tree: invalid JSON is ignored as a whole, and an invalid palette role or rule is skipped (and logged to the debug log) while the rest still apply. Edits to `config.json` take effect on the next tree drawn (the file's modification time is checked on each render); no restart.

## Schema

```json
{
  "palette": {
    "dark":  { "path": { "color": "#7AA2F7" }, "depth": [ { "color": "#D8B070" } ] },
    "light": { "path": { "color": "#2A4FA0" } }
  },
  "highlights": {
    "attention": { "style": { "weight": "bold" } },
    "todo": { "match": "\\bTODO\\b", "style": { "color": "error", "weight": "bold" } },
    "hex": false
  }
}
```

Top-level keys: `palette`, `highlights`. Anything else is ignored.

### palette

`palette.dark` applies on dark themes (and any theme that is not light), `palette.light` on `light`, `light-daltonized` and `light-ansi`. Each role you set merges key by key onto the built-in role, so `{ "path": { "color": "#9B59B6" } }` keeps the underline.

Roles, each one style:

| Role | Colors |
| --- | --- |
| `seed` | the root (`●` and its title) and the spine under it |
| `leafKey` | the `key:` of a `key: value` leaf |
| `code` | `` `code` ``, `/commands`, `--flags` |
| `path` | paths and URLs |
| `number` | numbers, dates, versions, sizes |
| `quote` | "quoted text" |
| `arrow` | arrows such as the right-arrow |
| `attention` | the background behind the opening statement of a node starting with `⚠` (built-ins: a muted amber a step off the theme's background, so the text keeps its own color) |
| `codeBlock` | the background behind a code block, inside a tree or after it (built-ins: a neutral grey a step off the theme's background; it fills the code text, not the guides) |

`depth` is a list of styles for branch labels and the guides beneath them, level 1 first (built-ins: tan, clay, rosewood, stone). Entry `i` merges onto level `i+1`; `{}` leaves a level unchanged; entries past the built-in four extend the list. The last entry is reused for deeper levels.

### Style keys

All optional; any other key rejects the style.

| Key | Value |
| --- | --- |
| `color`, `backgroundColor` | `#RGB`, `#RRGGBB`, `rgb(r,g,b)`, or a theme color name |
| `weight` | `regular`, `medium`, `semibold`, `bold` |
| `italic`, `underline`, `strikethrough`, `dimColor`, `inverse` | `true` or `false` |

Theme color names follow the light or dark theme, so one value reads on both: `text`, `inverseText`, `inactive`, `subtle`, `suggestion`, `remember`, `success`, `error`, `warning`, `merged`, `claude`, `permission`, `planMode`, `autoAccept`, `promptBorder`, `bashBorder`, `ide`, `diffAdded`, `diffRemoved`, `diffAddedDimmed`, `diffRemovedDimmed`, `diffAddedWord`, `diffRemovedWord`.

### highlights

An object of named rules. A name that matches a built-in merges into it; `false` turns it off; any other name adds your own rule, which runs after the built-ins (at the same position the earlier rule wins; otherwise the earliest match in the text wins).

Rule fields (any other field skips the rule):

| Field | Meaning |
| --- | --- |
| `match` | a JavaScript regex source string (remember to double the backslashes in JSON). Required for a new rule; on a built-in it replaces the pattern. A regex that is invalid or can match the empty string skips the rule |
| `style` | a style (above), required for a new rule. On a built-in it merges over the palette role it uses |
| `dark`, `light` | optional styles for one theme, validated like `style`. On that theme they merge key by key over `style` (and over a built-in's); the other theme is unaffected. Use them where one colour can't read on both backgrounds. A new rule still needs `style` |
| `scope` | `token` (default): just the matched text. `lead`: the label's opening statement, up to the first `:` followed by a space, else to the end of the first sentence, else the whole label, on every row it wraps onto. `label`: the whole label. For `lead` and `label` the match only decides which labels the rule applies to, and its style wins over tokens inside the range, except paths, which keep their look and stay links. A leaf a `lead` or `label` rule applies to has no green `key:` |
| `ignoreCase` | `true` for a case-insensitive match |
| `when` | when the model should write what the rule matches, e.g. `"a security-sensitive step"` (at most 300 characters). Every rule in force that has one is listed in the `/tree` prompt: a rule whose `match` is `^` plus literal text (`^🔒`) reads "Start a node with `🔒` only for ...", any other names its pattern. Without `when`, the rule only draws what the model happens to write |

Built-in rule names, in priority order (stable; a config relies on them):

| Name | Matches | Palette role |
| --- | --- | --- |
| `code` | `` `backticked` `` text (backticks hidden) | `code` |
| `url` | `http://`, `https://`, `ftp://`, `file://` URLs | `path` |
| `quote` | "double-quoted" text | `quote` |
| `home-path` | `~/x`, `./x`, `../x` | `path` |
| `abs-path` | `/abs/with/two/segments` | `path` |
| `rel-path` | `dir/file.ext` or `dir/sub/` | `path` |
| `hex` | `#RGB`, `#RRGGBB`, `#RRGGBBAA`, drawn in their own color | none |
| `command` | `/slash-commands` | `code` |
| `flag` | `--flags` and `--flag=value` | `code` |
| `date` | `2026-10-20` | `number` |
| `version` | `v1.2.3`, `1.2.3-beta.1` | `number` |
| `number` | `12`, `3.5`, `12%`, `4 MiB`, `200ms` | `number` |
| `arrow` | arrows | `arrow` |
| `attention` | a label starting with `⚠` (scope `lead`); its `when` puts it in the prompt: something the user must act on or could be harmed by, at most 1–2 per tree | `attention` |

To recolor every kind of path at once, change the `path` palette role; the three path rules and `url` all use it. Disabling one path rule (`"rel-path": false`) stops only that pattern.

## Examples

Make paths purple (keeps the underline, different purple per theme):

```json
{ "palette": { "dark": { "path": { "color": "#C792EA" } }, "light": { "path": { "color": "#6A2C91" } } } }
```

Highlight `prod` in red wherever it opens a node:

```json
{ "highlights": { "prod": { "match": "^prod(uction)?\\b", "scope": "lead", "ignoreCase": true, "style": { "color": "error", "weight": "bold" } } } }
```

Add a marker of your own, and tell the model when to use it:

```json
{ "highlights": { "lock": { "match": "^🔒", "scope": "lead", "when": "a security-sensitive step", "style": { "underline": true } } } }
```

Give a decision marker a subtle purple background that reads on both themes (`light` replaces just the background on a light theme):

```json
{ "highlights": { "decision": { "match": "^◆", "scope": "lead", "when": "a decision the user must make, stated as the choice itself", "style": { "backgroundColor": "#33283F" }, "light": { "backgroundColor": "#EDE3F7" } } } }
```

Turn off hex swatches, and give warnings a muted red background instead of amber:

```json
{
  "highlights": { "hex": false },
  "palette": { "dark": { "attention": { "backgroundColor": "#3D2326" } }, "light": { "attention": { "backgroundColor": "#F8DADA" } } }
}
```
