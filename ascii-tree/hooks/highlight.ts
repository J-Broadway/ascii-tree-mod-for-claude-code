// Pure styling: turns a laid-out tree row into styled runs, by the palette.

import type { Row } from './lib'
import { depthStyle, guideStyle, type Palette, type Style } from './palette'

/** A run of text and its style. */
export type Run = { text: string; style: Style }

/** The token classes the label highlighter finds. */
export type TokenKind = 'code' | 'path' | 'number' | 'quote' | 'arrow' | 'hex'

/** Trailing punctuation that ends a sentence rather than a path or URL. */
const TRAIL = /[.,;:!?)\]]+$/

/**
 * The token patterns, in priority order: at the same position the earlier
 * one wins. Each must be global (`g`) so it can be resumed at any position.
 */
const TOKENS: readonly { kind: TokenKind; re: RegExp; trim?: boolean; strip?: boolean }[] = [
  // `code`, shown without its backticks.
  { kind: 'code', re: /`([^`\n]+)`/g, strip: true },
  { kind: 'path', re: /\b(?:https?|ftp|file):\/\/[^\s<>"'`]+/g, trim: true },
  { kind: 'quote', re: /"[^"\n]+"|“[^”\n]+”/g },
  // ~/x, ./x, ../x; a space escaped as `\ ` stays in the path.
  { kind: 'path', re: /(?<![\w/])(?:~|\.{1,2})\/(?:\\ |[^\s"'`<>])*/g, trim: true },
  // /abs/with/slashes: two segments at least, not after a word ("and/or").
  { kind: 'path', re: /(?<![\w.~/-])\/(?:[\w.@+-]|\\ )+(?:\/(?:[\w.@+-]|\\ )*)+/g, trim: true },
  // foo/bar.ext or foo/bar/ (a relative path with an extension or a trailing slash).
  {
    kind: 'path',
    re: /(?<![\w./-])[\w@+-][\w.@+-]*(?:\/[\w.@+-]+)*(?:\/[\w@+-][\w.@+-]*\.[A-Za-z0-9]{1,8}\b|\/[\w@+-][\w.@+-]*\/)/g,
    trim: true,
  },
  // #8B5A2B, #abc, #RRGGBBAA: 3, 6 or 8 hex digits after `#`, not inside a
  // word. To leave issue refs like #123 alone, a token needs at least one
  // a-f letter, or exactly 6 digits (#123456 reads as a color).
  {
    kind: 'hex',
    re: /(?<![\w#&])#(?:(?=[0-9a-fA-F]*[a-fA-F])(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})|[0-9]{6})(?![\w])/g,
  },
  // /slash-command (also /plugin:command), not a path.
  { kind: 'code', re: /(?<![\w/.~-])\/[a-z][\w-]*(?::[\w-]+)?(?![\w/.])/g },
  // --flag, --flag=value
  { kind: 'code', re: /(?<![\w-])--[a-zA-Z][\w-]*(?:=[^\s,;]+)?/g },
  // 2026-10-20
  { kind: 'number', re: /(?<![\w.-])\d{4}-\d{2}-\d{2}(?![\w-])/g },
  // v0.2.0, V1.2, 1.2.3-beta.1: the `v` is part of the token.
  { kind: 'number', re: /(?<![\w.])[vV]?\d+(?:\.\d+){1,3}(?:-[A-Za-z0-9.]+)?(?![\w])/g },
  // 1600s, 4 MiB, 12%, 3.5, 1,024, 200ms
  {
    kind: 'number',
    re: /(?<![\w.#])\d[\d,]*(?:\.\d+)?(?:s\b|%|\s?(?:[KMGTP]i?B|[kKMGT]B|B|bytes|ms|µs|ns|px|sec|min|h)\b)?(?![\w])/g,
  },
  { kind: 'arrow', re: /[→←↔⇒⇐⇔⟶⟵➜]/g },
]

export type Token = { text: string; kind?: TokenKind }

/**
 * A whole absolute, ~/, ./ or ../ path, or a URL, spaces allowed: what a
 * quoted or backticked span must be to draw as a path rather than as a quote
 * or code. Quoting is how a path with bare spaces is told from prose.
 */
const WHOLE_PATH = /^(?:(?:~|\.{1,2})?\/[^\n"'`<>]*[^\s"'`<>]|[a-z]+:\/\/[^\s"'`<>]+)$/i

/** The text between a span's quotes or backticks. */
const inner = (span: string): string => span.slice(1, -1)

/**
 * Splits label text into plain runs and highlighted tokens, without markup:
 * the earliest match wins, ties go to the earlier pattern.
 */
export const tokenize = (text: string): Token[] => {
  const out: Token[] = []
  let pos = 0
  let plain = ''
  while (pos < text.length) {
    let best: { at: number; text: string; kind: TokenKind; shown: string } | undefined
    for (const { kind, re, trim, strip } of TOKENS) {
      re.lastIndex = pos
      const m = re.exec(text)
      if (m === null) continue
      let matched = m[0]
      if (trim) matched = matched.replace(TRAIL, '')
      if (matched.length === 0) continue
      if (best === undefined || m.index < best.at) {
        best = { at: m.index, text: matched, kind, shown: strip ? (m[1] ?? matched) : matched }
        // "~/My Files/x" or `~/My Files/x`: a path, drawn without its quotes.
        if ((kind === 'code' || kind === 'quote') && WHOLE_PATH.test(inner(matched))) {
          best = { ...best, kind: 'path', shown: inner(matched) }
        }
      }
    }
    if (best === undefined) break
    plain += text.slice(pos, best.at)
    if (plain !== '') out.push({ text: plain })
    plain = ''
    out.push({ text: best.shown, kind: best.kind })
    pos = best.at + best.text.length
  }
  plain += text.slice(pos)
  if (plain !== '') out.push({ text: plain })
  return out
}

/**
 * The `key:` of a `key: value` leaf: up to and including the first colon,
 * when that colon is followed by a space (or ends the text) and the key is
 * short, three words at most. Undefined otherwise.
 */
export const leafKey = (text: string): string | undefined => {
  const m = /^([^:`"\s][^:`"]*?):(?=\s|$)/.exec(text)
  if (m === null) return undefined
  const key = m[1] ?? ''
  if (key.trim().split(/\s+/).length > 3 || key.length > 32) return undefined
  return m[0]
}

/** Merges adjacent runs of the same style. */
const merge = (runs: Run[]): Run[] =>
  runs.reduce<Run[]>((out, run) => {
    const last = out[out.length - 1]
    if (last !== undefined && JSON.stringify(last.style) === JSON.stringify(run.style)) {
      last.text += run.text
    } else if (run.text !== '') {
      out.push({ ...run })
    }
    return out
  }, [])

const GLYPH = /[│┃├└┣┗╰┬╭]/
const RULE = /[─━]/

/**
 * The guide part of a row, colored by lineage (the rule in full is on
 * `Palette`): every glyph, connector or vertical, takes the color of the
 * parent that owns its column, a guide no branch has claimed yet the seed's;
 * a rule (── ━━) follows the glyph it extends, so a connector is one color,
 * the parent's, to a leaf or a branch alike. Spaces ride along with the run
 * before them.
 */
export const prefixRuns = (row: Row, palette: Palette): Run[] => {
  const chars = Array.from(row.prefix)
  const runs: Run[] = []
  let current: Style = {}
  chars.forEach((ch, col) => {
    if (GLYPH.test(ch)) {
      let owner = row.owners[col]
      for (let k = col - 1; owner === undefined && k >= 0; k--) owner = row.owners[k]
      // Before any branch (the spine under the root): the seed's.
      current = guideStyle(palette, owner ?? 0)
    } else if (!RULE.test(ch) && ch !== ' ') {
      current = { dimColor: true }
    }
    runs.push({ text: ch, style: current })
  })
  return merge(runs)
}

/**
 * Where a path token links: a URL to itself, an absolute or `~/` path to its
 * `file://` URL (a terminal opens a directory's in the file manager), an
 * escaped space (`\ `) unescaped first. Relative paths have no known base and
 * are not linked; nor is a `~/` path without `home`.
 */
export const pathHref = (written: string, home: string | undefined): string | undefined => {
  if (/^[a-z]+:\/\//i.test(written)) return written
  const path = written.replace(/\\ /g, ' ')
  const abs = path.startsWith('~/') ? (home === undefined ? undefined : home.replace(/\/$/, '') + path.slice(1)) : path
  if (abs === undefined || !abs.startsWith('/')) return undefined
  return 'file://' + encodeURI(abs)
}

/** A hex token as a color a terminal draws: #RGB widened, #RRGGBBAA's alpha dropped. */
export const hexColor = (token: string): string => {
  const hex = token.slice(1)
  if (hex.length === 3) return '#' + Array.from(hex, c => c + c).join('')
  return '#' + hex.slice(0, 6)
}

/**
 * Label text with its tokens highlighted on top of a base style; a hex token
 * is drawn in its own color. Asterisks are plain text, drawn as written.
 */
const tokenRuns = (text: string, base: Style, palette: Palette): Run[] =>
  tokenize(text).map(t => ({
    text: t.text,
    style:
      t.kind === undefined
        ? base
        : t.kind === 'hex'
          ? { ...base, color: hexColor(t.text) }
          : { ...base, ...palette[t.kind] },
  }))

/**
 * The label part of a row: the root in the seed style; a branch bold in its
 * depth's color; a leaf in the default text color with a short `key:` in
 * the leaf-key color. Tokens are highlighted in every label but the root's.
 */
export const labelRuns = (row: Row, palette: Palette): Run[] => {
  if (row.label === '') return []
  if (row.role === 'root') return [{ text: row.label, style: palette.seed }]
  if (row.hasChildren) {
    return merge(tokenRuns(row.label, depthStyle(palette, Math.max(row.depth, 1)), palette))
  }
  const key = row.first ? leafKey(row.label) : undefined
  if (key === undefined) return merge(tokenRuns(row.label, {}, palette))
  return merge([
    { text: key, style: palette.leafKey },
    ...tokenRuns(row.label.slice(key.length), {}, palette),
  ])
}
