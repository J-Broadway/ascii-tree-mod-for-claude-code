// The tree's colors, all in one place: one palette per theme, swapped
// without touching the layout or the tokenizer.

import type { TextProps, ThemeKey } from 'claude-code'

/**
 * The style of a run of text: the subset of Text props a palette or a user
 * rule sets. `color` and `backgroundColor` are a hex color or a theme key
 * (`warning`, `error`, `inverseText`, ...), which follows the light/dark theme.
 */
export type Style = Pick<
  TextProps,
  'color' | 'backgroundColor' | 'weight' | 'italic' | 'underline' | 'strikethrough' | 'dimColor' | 'inverse'
>

/** The theme keys a color may name: they follow the theme, so one value reads on light and dark. */
export const THEME_KEYS: readonly ThemeKey[] = [
  'text', 'inverseText', 'inactive', 'subtle', 'suggestion', 'remember', 'success', 'error', 'warning',
  'merged', 'claude', 'permission', 'planMode', 'autoAccept', 'promptBorder', 'bashBorder', 'ide',
  'diffAdded', 'diffRemoved', 'diffAddedDimmed', 'diffRemovedDimmed', 'diffAddedWord', 'diffRemovedWord',
]

const WEIGHTS = ['regular', 'medium', 'semibold', 'bold']
const FLAGS = ['italic', 'underline', 'strikethrough', 'dimColor', 'inverse']
/** Every key a style may set, for the schema reference and error messages. */
export const STYLE_KEYS: readonly string[] = ['color', 'backgroundColor', 'weight', ...FLAGS]

const isColor = (v: unknown): boolean =>
  typeof v === 'string' &&
  (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ||
    /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(v) ||
    (THEME_KEYS as readonly string[]).includes(v))

/**
 * Reads a user-written style, strictly: an unknown key, a wrong type or an
 * unreadable color rejects the whole style (with why), so a typo never
 * silently half-applies.
 */
export const parseStyle = (value: unknown): { style: Style } | { error: string } => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { error: 'style must be an object' }
  const style: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (key === 'color' || key === 'backgroundColor') {
      if (!isColor(v)) return { error: `${key}: "${String(v)}" is not #RGB, #RRGGBB, rgb(r,g,b) or a theme key` }
    } else if (key === 'weight') {
      if (typeof v !== 'string' || !WEIGHTS.includes(v)) return { error: `weight must be one of ${WEIGHTS.join(', ')}` }
    } else if (FLAGS.includes(key)) {
      if (typeof v !== 'boolean') return { error: `${key} must be true or false` }
    } else return { error: `unknown style key "${key}" (allowed: ${STYLE_KEYS.join(', ')})` }
    style[key] = v
  }
  return { style: style as Style }
}

/**
 * A tree palette, by role. The coloring rule ("lineage"), exactly:
 * - Every guide glyph, connector (├── └── ┣━━ ┗━━ ├─ └─, rule included) and
 *   vertical (│ ┃, also the stems on wrapped continuation rows) alike, takes
 *   the color of the PARENT that owns its column: the root's spine and the
 *   top-level ┣━━/┗━━ are `seed`; a depth-1 branch's children's connectors
 *   and the │ beneath it are `depth[0]`; and so on down.
 * - A connector is ONE color, the parent's, glyph and rule alike, whether
 *   it leads to a leaf or a branch (`├──` all tan, `┣━━` all seed).
 * - A branch label is bold in its own depth color: depth 1 = `depth[0]`,
 *   depth 2 = `depth[1]`, ... the last entry reused deeper. The root is `seed`.
 * - A leaf's short `key:` is `leafKey`; a branch label has no key split.
 * - Asterisks are plain text: `*word*` is drawn as written, in the style of
 *   the label around it.
 *
 * A user's `~/.claude/ascii-tree/config.json` can override any role per theme
 * (see `config.ts`): each override merges key by key onto the role's built-in
 * style, so `{ "path": { "color": "#9B59B6" } }` keeps the underline.
 */
export type Palette = {
  /** The root (`●` and its title) and the spine it owns. */
  seed: Style
  /** Branch labels and the guides beneath them, by depth from 1 (top level). */
  depth: readonly Style[]
  /** The `key:` of a `key: value` leaf. */
  leafKey: Style
  /** /commands, --flags and `code`. */
  code: Style
  /** Paths and URLs. */
  path: Style
  /** Numbers, dates, years, versions, sizes. */
  number: Style
  /** "Quoted text". */
  quote: Style
  /** → ← ↔ ⇒ */
  arrow: Style
  /**
   * The opening statement of a node that starts with ⚠: a background a step
   * off the terminal's, so it stands out while the text keeps its own color.
   */
  attention: Style
  /**
   * A code block, inside a tree or after it: a background a step off the
   * terminal's, neutral grey, so code reads as a block while its text keeps
   * the default color. It fills the code text, never the guides beside it.
   */
  codeBlock: Style
}

/**
 * Lineage: brown seed, warm branches by depth, green reserved for leaf keys.
 *
 * The branch depths run tan → clay → rosewood → stone: warm hues (36°, 19°,
 * 343°) ending in a warm neutral, none of them near leaf green #6A9F4A (97°).
 * Each is lighter and less saturated than seed brown #8B5A2B, redder or
 * greyer than amber numbers #D4A23A, and far from path blue #5B9BD5. All sit
 * at mid luminance, so they read on dark (≈4.7–6.9:1 on #1E1E1E) and light
 * (≈2.4–3.6:1 on white, drawn bold) backgrounds.
 */
export const LINEAGE: Palette = {
  seed: { color: '#8B5A2B', weight: 'bold' },
  depth: [
    { color: '#C8A165', weight: 'bold' }, // tan
    { color: '#C27C5B', weight: 'bold' }, // clay
    { color: '#B07888', weight: 'bold' }, // rosewood
    { color: '#9A8C80', weight: 'bold' }, // stone
  ],
  leafKey: { color: '#6A9F4A' },
  // A theme key, so it stays readable on both light and dark themes.
  code: { color: 'permission' },
  path: { color: '#5B9BD5', underline: true },
  number: { color: '#D4A23A' },
  quote: { italic: true },
  arrow: { dimColor: true },
  // A muted amber a little lighter than a dark background: white text reads on it.
  attention: { backgroundColor: '#3B3223' },
  // Neutral grey a step lighter than a dark background (~#1E1E1E): default text reads on it.
  codeBlock: { backgroundColor: '#2D2D2D' },
}

/**
 * Lineage for light themes: the same hues, darkened until each clears
 * WCAG AA (4.5:1) on white and on #F5F5F5, so the tree reads without
 * leaning on bold. Seed ≈10:1; tan 5.5, clay 6.0, rosewood 6.7, stone 6.2;
 * leaf green 5.2, path blue 6.4, amber numbers 5.6 (all on white).
 */
export const LINEAGE_LIGHT: Palette = {
  seed: { color: '#5C3A1A', weight: 'bold' },
  depth: [
    { color: '#8A6224', weight: 'bold' }, // tan
    { color: '#A04A2A', weight: 'bold' }, // clay
    { color: '#8C4560', weight: 'bold' }, // rosewood
    { color: '#6B5F55', weight: 'bold' }, // stone
  ],
  leafKey: { color: '#3D7A22' },
  code: { color: 'permission' },
  path: { color: '#1F5FA8', underline: true },
  number: { color: '#8F5E00' },
  quote: { italic: true },
  arrow: { dimColor: true },
  // A pale amber a little darker than white: black text reads on it.
  attention: { backgroundColor: '#F6EBC9' },
  // Neutral grey a step darker than white: black text reads on it.
  codeBlock: { backgroundColor: '#EBEBEB' },
}

/**
 * The palette for a `theme` setting: the light one for any light theme
 * (`light`, `light-daltonized`, `light-ansi`), else the dark one, which
 * also covers a theme that follows the terminal and can't be read here.
 */
export const paletteFor = (theme: unknown): Palette =>
  typeof theme === 'string' && theme.startsWith('light') ? LINEAGE_LIGHT : LINEAGE

/** The style of a branch (and its guides) at `depth`; 0 is the seed. */
export const depthStyle = (palette: Palette, depth: number): Style =>
  depth <= 0
    ? palette.seed
    : (palette.depth[Math.min(depth, palette.depth.length) - 1] ?? palette.seed)

/** The color alone, for the guides (connectors and verticals) a node at `depth` owns. */
export const guideStyle = (palette: Palette, depth: number): Style => {
  const color = depthStyle(palette, depth).color
  return color === undefined ? {} : { color }
}
