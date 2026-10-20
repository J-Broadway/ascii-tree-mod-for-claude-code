// The tree's colors, all in one place: one palette per theme, swapped
// without touching the layout or the tokenizer.

import type { TextProps } from 'claude-code'

/** The style of a run of text: the subset of Text props a palette sets. */
export type Style = Pick<TextProps, 'color' | 'weight' | 'italic' | 'underline' | 'dimColor'>

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
