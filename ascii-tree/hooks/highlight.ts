// Pure styling: turns a laid-out tree row into styled runs, by the palette.

import type { Row } from './lib'
import { depthStyle, guideStyle, type Palette, type Style } from './palette'
import { defaultRules, type Rule, type TokenKind } from './rules'

/** A run of text and its style. */
/**
 * A run of text and its style; `path` marks a path or URL token, the one kind
 * whose underline means a link (and is dropped where it can't be one).
 */
export type Run = { text: string; style: Style; path?: true }

export type { TokenKind } from './rules'

/** Trailing punctuation that ends a sentence rather than a path or URL. */
const TRAIL = /[.,;:!?)\]]+$/

/** The built-in rules, compiled once: what a tree is drawn with when the user has no config. */
export const DEFAULT_RULES: readonly Rule[] = defaultRules()

export type Token = { text: string; kind?: TokenKind }

/** A token and the rule that found it, for styling; `raw` is the text as written, backticks and quotes kept. */
type Found = Token & { rule?: Rule; raw: string }

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
 * the earliest match wins, ties go to the earlier rule. Only `token`-scope
 * rules find tokens; `lead` and `label` rules color a range (see `labelRuns`).
 */
export const tokenize = (text: string, rules: readonly Rule[] = DEFAULT_RULES): Token[] =>
  scan(text, rules).map(({ text, kind }) => (kind === undefined ? { text } : { text, kind }))

const scan = (text: string, rules: readonly Rule[]): Found[] => {
  const out: Found[] = []
  let pos = 0
  let plain = ''
  while (pos < text.length) {
    let best: { at: number; text: string; kind: TokenKind; shown: string; rule: Rule } | undefined
    for (const rule of rules) {
      const { kind, re, trim, strip } = rule
      if (rule.scope !== 'token') continue
      re.lastIndex = pos
      const m = re.exec(text)
      if (m === null) continue
      let matched = m[0]
      if (trim) matched = matched.replace(TRAIL, '')
      if (matched.length === 0) continue
      if (best === undefined || m.index < best.at) {
        best = { at: m.index, text: matched, kind, shown: strip ? (m[1] ?? matched) : matched, rule }
        // "~/My Files/x" or `~/My Files/x`: a path, drawn without its quotes.
        if ((kind === 'code' || kind === 'quote') && WHOLE_PATH.test(inner(matched))) {
          best = { ...best, kind: 'path', shown: inner(matched) }
        }
      }
    }
    if (best === undefined) break
    plain += text.slice(pos, best.at)
    if (plain !== '') out.push({ text: plain, raw: plain })
    plain = ''
    out.push({ text: best.shown, kind: best.kind, rule: best.rule, raw: best.text })
    pos = best.at + best.text.length
  }
  plain += text.slice(pos)
  if (plain !== '') out.push({ text: plain, raw: plain })
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
    if (last !== undefined && last.path === run.path && JSON.stringify(last.style) === JSON.stringify(run.style)) {
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
 * The absolute path a written path names: an escaped space (`\ `) unescaped,
 * `~/` under `home`, a relative path under `cwd` with its `.` and `..`
 * segments resolved. Undefined for a URL, or when the base it needs is unknown.
 */
export const resolvePath = (written: string, home?: string, cwd?: string): string | undefined => {
  if (/^[a-z]+:\/\//i.test(written)) return undefined
  const path = written.replace(/\\ /g, ' ')
  if (path.startsWith('/')) return path
  if (path.startsWith('~/')) return home === undefined ? undefined : home.replace(/\/$/, '') + path.slice(1)
  if (cwd === undefined) return undefined
  const segments: string[] = []
  for (const segment of `${cwd}/${path}`.split('/')) {
    if (segment === '..') segments.pop()
    else if (segment !== '' && segment !== '.') segments.push(segment)
  }
  return '/' + segments.join('/') + (path.endsWith('/') ? '/' : '')
}

/**
 * Where a path token links: a URL to itself, a path to the `file://` URL of
 * what it resolves to (a terminal opens a directory's in the file manager).
 * A relative path links only given `cwd`, which the caller passes once it
 * knows the path exists there; a `~/` path needs `home`.
 */
export const pathHref = (written: string, home: string | undefined, cwd?: string): string | undefined => {
  if (/^[a-z]+:\/\//i.test(written)) return written
  const abs = resolvePath(written, home, cwd)
  return abs === undefined ? undefined : 'file://' + encodeURI(abs)
}

/** A hex token as a color a terminal draws: #RGB widened, #RRGGBBAA's alpha dropped. */
export const hexColor = (token: string): string => {
  const hex = token.slice(1)
  if (hex.length === 3) return '#' + Array.from(hex, c => c + c).join('')
  return '#' + hex.slice(0, 6)
}

/**
 * A run of label text, what it was written as (`raw`) and how many of the
 * raw characters are a delimiter before the text (`pad`: `code`'s backtick,
 * a quoted path's quote). A range style leaves a `path` run alone, so it
 * stays a link.
 */
type Piece = Run & { raw: string; pad: number }

/**
 * Label text with its tokens highlighted on top of a base style: the kind's
 * palette role, then the rule's own style on top; a hex token is drawn in its
 * own color. Asterisks are plain text, drawn as written.
 */
const tokenRuns = (text: string, base: Style, palette: Palette, rules: readonly Rule[]): Piece[] =>
  scan(text, rules).map(t => {
    const pad = Math.floor((t.raw.length - t.text.length) / 2)
    if (t.kind === undefined || t.rule === undefined) return { text: t.text, raw: t.raw, pad, style: base }
    const own = t.kind === 'hex' ? { color: hexColor(t.text) } : roleStyle(palette, t.kind)
    const style = { ...base, ...own, ...t.rule.style }
    return t.kind === 'path' ? { text: t.text, raw: t.raw, pad, style, path: true } : { text: t.text, raw: t.raw, pad, style }
  })

/** The palette role a rule's kind draws in; `hex` and `custom` have none. */
const roleStyle = (palette: Palette, kind: TokenKind): Style =>
  kind === 'hex' || kind === 'custom' ? {} : palette[kind]

/**
 * The pieces a row shows: those of its node's whole label (written text
 * `from` to `to`), a token the wrap split drawn in its own style on each
 * side, its delimiters (`code`'s backticks, a quoted path's quotes) dropped
 * wherever they fall.
 */
const clip = (pieces: readonly Piece[], from: number, to: number): Piece[] => {
  const out: Piece[] = []
  let at = 0
  for (const piece of pieces) {
    const start = at
    at += piece.raw.length
    if (at <= from || start >= to) continue
    const text = piece.text.slice(Math.max(0, from - start - piece.pad), Math.max(0, to - start - piece.pad))
    if (text !== '') out.push({ ...piece, text })
  }
  return out
}

/** A piece cut in two `cut` characters into its text, each half keeping its share of the written text. */
const split = (piece: Piece, cut: number): [Piece, Piece] => [
  { ...piece, text: piece.text.slice(0, cut), raw: piece.raw.slice(0, piece.pad + cut) },
  { ...piece, text: piece.text.slice(cut), raw: piece.raw.slice(piece.pad + cut), pad: 0 },
]

/**
 * Where a label's opening statement ends: after the first `:` followed by
 * whitespace, else after the first sentence's `.`, `!` or `?`, else the end.
 */
export const leadEnd = (text: string): number => {
  const colon = /:(?=\s)/.exec(text)
  if (colon !== null) return colon.index + 1
  const stop = /[.!?](?=\s|$)/.exec(text)
  return stop === null ? text.length : stop.index + 1
}

/** The `lead` and `label` rules whose match a node's label meets. */
const rangeRulesOf = (label: string, rules: readonly Rule[]): Rule[] =>
  rules.filter(rule => {
    if (rule.scope === 'token') return false
    rule.re.lastIndex = 0
    return rule.re.test(label)
  })

/**
 * Lays the `lead` and `label` rules over a label's pieces: the rule's style
 * (its kind's palette role, then its own) wins over the tokens inside its
 * range, so the highlight reads as one, except paths, which keep their own
 * look and stay links. Laid over the whole label before it is cut into rows,
 * so a statement that wraps is highlighted on every row it reaches.
 */
const rangeRuns = (pieces: Piece[], ranged: readonly Rule[], palette: Palette): Piece[] => {
  let out = pieces
  for (const rule of ranged) {
    // Measured on the label as drawn: a `code` token's backticks are gone from
    // the pieces, so an offset into the written label would overshoot.
    const shown = out.map(piece => piece.text).join('')
    const end = rule.scope === 'lead' ? leadEnd(shown) : shown.length
    const style = { ...roleStyle(palette, rule.kind), ...rule.style }
    let at = 0
    out = out.flatMap((piece): Piece[] => {
      const from = at
      at += piece.text.length
      if (piece.path || from >= end) return [piece]
      const cut = Math.min(piece.text.length, end - from)
      const [inside, rest] = split(piece, cut)
      const lit = { ...inside, style: { ...piece.style, ...style } }
      return rest.text === '' ? [{ ...lit, raw: piece.raw }] : [lit, rest]
    })
  }
  return out
}

/**
 * The label part of a row: the root in the seed style; a branch bold in its
 * depth's color; a leaf in the default text color with a short `key:` in
 * the leaf-key color. Tokens are highlighted in every label but the root's,
 * then the `lead` and `label` rules (such as `attention`) lay their style
 * over their range. A label a range rule applies to has no `key:` split: its
 * marker opens it, and the highlight is what marks its opening statement.
 */
export const labelRuns = (row: Row, palette: Palette, rules: readonly Rule[] = DEFAULT_RULES): Run[] => {
  if (row.label === '') return []
  if (row.role === 'rule') return [{ text: row.label, style: { dimColor: true } }]
  if (row.role === 'root') return [{ text: row.label, style: palette.seed }]
  const base = row.hasChildren ? depthStyle(palette, Math.max(row.depth, 1)) : {}
  // A node's hard-break continuation lines are its body: never a key, never ranged.
  const pieces = (text: string, own: boolean): Piece[] => {
    const ranged = own ? rangeRulesOf(text, rules) : []
    const key = own && !row.hasChildren && ranged.length === 0 ? leafKey(text) : undefined
    const tokens =
      key === undefined
        ? tokenRuns(text, base, palette, rules)
        : [{ text: key, raw: key, pad: 0, style: palette.leafKey }, ...tokenRuns(text.slice(key.length), base, palette, rules)]
    return rangeRuns(tokens, ranged, palette)
  }
  // Tokens and ranges are found on the whole label and cut at the row
  // breaks, so a token the wrap split (a long `code` span) is still drawn as
  // itself and a highlight runs on across rows; a row that can't be placed
  // in its label is drawn alone, as its own first row or not.
  const shown =
    row.offset === undefined
      ? pieces(row.label, row.first)
      : clip(pieces(row.whole, !row.continuation), row.offset, row.offset + row.label.length)
  return merge(shown.map(({ raw, pad, ...run }) => run))
}
