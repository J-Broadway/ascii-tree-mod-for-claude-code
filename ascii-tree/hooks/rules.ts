// The highlight rules: a named, ordered registry. The built-ins are the
// token classes the tree has always highlighted; a user's config.json can
// restyle, retarget or disable them by name, and add rules of its own.

import { parseStyle, type Style } from './palette'

/** The token classes the label highlighter finds; `custom` is any user rule. */
export type TokenKind = 'code' | 'path' | 'number' | 'quote' | 'arrow' | 'hex' | 'attention' | 'decision' | 'recommended' | 'custom'

/**
 * What a rule colors: `token` just the matched text; `lead` the label's
 * opening statement (up to the first `:` followed by a space, else the first
 * sentence, else the whole label); `label` the whole label. For `lead` and
 * `label` the match only decides WHICH labels the rule applies to.
 */
export type Scope = 'token' | 'lead' | 'label'

export const SCOPES: readonly Scope[] = ['token', 'lead', 'label']

/** A rule as written: `match` is a regex source; `style` lands on top of the kind's palette role. */
export type RuleDef = {
  match: string
  kind: TokenKind
  style?: Style
  /** Per-theme tweaks: on that theme they merge key by key over `style` (see `styleFor`). */
  dark?: Style
  light?: Style
  scope?: Scope
  ignoreCase?: boolean
  /** Drop trailing sentence punctuation from the match (paths, URLs). */
  trim?: boolean
  /** Show capture group 1 only (`code` without its backticks). */
  strip?: boolean
  /**
   * When the model should write what this rule matches: a rule that has it is
   * listed in the tree prompt (see `markerGuide`), so one config entry says
   * both how a marker looks and when to use it.
   */
  when?: string
}

/** A rule ready to run: its regex is global, so it can resume at any position. */
export type Rule = {
  name: string
  def: RuleDef
  re: RegExp
  kind: TokenKind
  scope: Scope
  style: Style
  trim: boolean
  strip: boolean
}

/**
 * The built-in rules, in priority order: at the same position the earlier
 * one wins. The names are stable and documented in CONFIG.md; changing one
 * breaks users' configs.
 */
export const BUILTIN: readonly (RuleDef & { name: string })[] = [
  // `code`, shown without its backticks.
  { name: 'code', kind: 'code', match: /`([^`\n]+)`/.source, strip: true },
  { name: 'url', kind: 'path', match: /\b(?:https?|ftp|file):\/\/[^\s<>"'`]+/.source, trim: true },
  { name: 'quote', kind: 'quote', match: /"[^"\n]+"|“[^”\n]+”/.source },
  // ~/x, ./x, ../x; a space escaped as `\ ` stays in the path.
  { name: 'home-path', kind: 'path', match: /(?<![\w/])(?:~|\.{1,2})\/(?:\\ |[^\s"'`<>])*/.source, trim: true },
  // /abs/with/slashes: two segments at least, not after a word ("and/or").
  {
    name: 'abs-path',
    kind: 'path',
    match: /(?<![\w.~/-])\/(?:[\w.@+-]|\\ )+(?:\/(?:[\w.@+-]|\\ )*)+/.source,
    trim: true,
  },
  // foo/bar.ext or foo/bar/ (a relative path with an extension or a trailing slash).
  {
    name: 'rel-path',
    kind: 'path',
    match: /(?<![\w./-])[\w@+-][\w.@+-]*(?:\/[\w.@+-]+)*(?:\/[\w@+-][\w.@+-]*\.[A-Za-z0-9]{1,8}\b|\/[\w@+-][\w.@+-]*\/)/.source,
    trim: true,
  },
  // #8B5A2B, #abc, #RRGGBBAA: 3, 6 or 8 hex digits after `#`, not inside a
  // word. To leave issue refs like #123 alone, a token needs at least one
  // a-f letter, or exactly 6 digits (#123456 reads as a color).
  {
    name: 'hex',
    kind: 'hex',
    match: /(?<![\w#&])#(?:(?=[0-9a-fA-F]*[a-fA-F])(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})|[0-9]{6})(?![\w])/.source,
  },
  // /slash-command (also /plugin:command), not a path.
  { name: 'command', kind: 'code', match: /(?<![\w/.~-])\/[a-z][\w-]*(?::[\w-]+)?(?![\w/.])/.source },
  // --flag, --flag=value
  { name: 'flag', kind: 'code', match: /(?<![\w-])--[a-zA-Z][\w-]*(?:=[^\s,;]+)?/.source },
  // 2026-10-20
  { name: 'date', kind: 'number', match: /(?<![\w.-])\d{4}-\d{2}-\d{2}(?![\w-])/.source },
  // v0.2.0, V1.2, 1.2.3-beta.1: the `v` is part of the token.
  { name: 'version', kind: 'number', match: /(?<![\w.])[vV]?\d+(?:\.\d+){1,3}(?:-[A-Za-z0-9.]+)?(?![\w])/.source },
  // 1600s, 4 MiB, 12%, 3.5, 1,024, 200ms
  {
    name: 'number',
    kind: 'number',
    match: /(?<![\w.#])\d[\d,]*(?:\.\d+)?(?:s\b|%|\s?(?:[KMGTP]i?B|[kKMGT]B|B|bytes|ms|µs|ns|px|sec|min|h)\b)?(?![\w])/.source,
  },
  { name: 'arrow', kind: 'arrow', match: /[→←↔⇒⇐⇔⟶⟵➜]/.source },
  // A label that starts with ⚠ is something the reader must act on: its
  // opening statement (⚠ included) sits on the palette's `attention`
  // background, subtle enough that the text keeps its own color.
  {
    name: 'attention',
    kind: 'attention',
    match: /^⚠/.source,
    scope: 'lead',
    when: 'critical information the user must not miss, or something they must act on or could be harmed by; at most 1–2 per tree',
  },
  // A decision the user must make: its opening statement (◆ included) sits on
  // the palette's `decision` background; its options hang beneath it, the
  // suggested one marked by the `recommended` rule.
  {
    name: 'decision',
    kind: 'decision',
    match: /^◆/.source,
    scope: 'lead',
    when: 'a decision the user must make, stated as the choice itself, with its options as the node\'s children',
  },
  // The option an agent recommends among several: the whole node sits on the
  // palette's `recommended` background, so the pick stands out from the rest.
  {
    name: 'recommended',
    kind: 'recommended',
    match: /\(recommended\)/.source,
    ignoreCase: true,
    scope: 'label',
    when: 'the option you recommend among choices, at the end of its line; at most one per decision',
  },
]

/** Which theme the rules are drawn for. */
export type Mode = 'dark' | 'light'

/**
 * A rule's style on one theme: its `dark`/`light` override merged over `style`.
 * One colour rarely reads on both a dark and a light background, so a rule
 * may adjust only the keys that differ.
 */
const styleFor = (def: RuleDef, mode: Mode): Style => ({ ...def.style, ...def[mode] })

/** Compiles a rule; undefined (with why) when its regex is invalid or matches the empty string. */
const compile = (
  name: string,
  def: RuleDef,
  log: (msg: string) => void,
  mode: Mode = 'dark',
): Rule | undefined => {
  let re: RegExp
  try {
    re = new RegExp(def.match, def.ignoreCase === true ? 'gi' : 'g')
  } catch (error) {
    log(`rule "${name}" skipped: bad regex (${error instanceof Error ? error.message : String(error)})`)
    return undefined
  }
  if (re.test('')) {
    log(`rule "${name}" skipped: its regex matches the empty string`)
    return undefined
  }
  re.lastIndex = 0
  return {
    name,
    def,
    re,
    kind: def.kind,
    scope: def.scope ?? 'token',
    style: styleFor(def, mode),
    trim: def.trim === true,
    strip: def.strip === true,
  }
}

const PATCH_KEYS = ['match', 'style', 'dark', 'light', 'scope', 'ignoreCase', 'when']

/** The longest `when` a rule may carry: it goes into every tree prompt. */
const MAX_WHEN = 300

/** Reads one user rule, strictly: only known keys of the right types. */
const parsePatch = (value: unknown): { patch: Partial<RuleDef> } | { error: string } => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { error: 'must be an object or false' }
  const patch: Partial<RuleDef> = {}
  for (const [key, v] of Object.entries(value)) {
    if (!PATCH_KEYS.includes(key)) return { error: `unknown key "${key}" (allowed: ${PATCH_KEYS.join(', ')})` }
    if (key === 'match') {
      if (typeof v !== 'string' || v === '') return { error: 'match must be a non-empty regex string' }
      patch.match = v
    } else if (key === 'scope') {
      if (!SCOPES.includes(v as Scope)) return { error: `scope must be one of ${SCOPES.join(', ')}` }
      patch.scope = v as Scope
    } else if (key === 'when') {
      if (typeof v !== 'string' || v.trim() === '' || v.length > MAX_WHEN) {
        return { error: `when must be a non-empty string of at most ${MAX_WHEN} characters` }
      }
      patch.when = v.trim()
    } else if (key === 'ignoreCase') {
      if (typeof v !== 'boolean') return { error: 'ignoreCase must be true or false' }
      patch.ignoreCase = v
    } else {
      // `style`, `dark` or `light`: all one style shape.
      const parsed = parseStyle(v)
      if ('error' in parsed) return { error: `${key}: ${parsed.error}` }
      patch[key as 'style' | 'dark' | 'light'] = parsed.style
    }
  }
  return { patch }
}

/** The built-in rules, compiled (they have no per-theme styles, so one set serves both themes). */
export const defaultRules = (log: (msg: string) => void = () => {}): Rule[] =>
  BUILTIN.flatMap(({ name, ...def }) => compile(name, def, log) ?? [])

/**
 * The rules in force: the built-ins in order, then the user's. A user entry
 * named like a built-in merges into it (its position stays); `false` disables
 * it; a new name adds a rule after the built-ins, in the file's order, and
 * needs `match` and `style`. An invalid entry is skipped, logged, and the
 * rest still apply; a bad override leaves the built-in as it was. `mode`
 * picks which per-theme styles (`dark`/`light`) are folded into `style`.
 */
export const compileRules = (
  highlights: Readonly<Record<string, unknown>>,
  log: (msg: string) => void = () => {},
  mode: Mode = 'dark',
): Rule[] => {
  const defs = new Map<string, RuleDef>(BUILTIN.map(({ name, ...def }) => [name, def]))
  const builtin = new Set(defs.keys())
  for (const [name, value] of Object.entries(highlights)) {
    if (value === false) {
      defs.delete(name)
      continue
    }
    if (value === true || value === null) continue
    const parsed = parsePatch(value)
    if ('error' in parsed) {
      log(`rule "${name}" skipped: ${parsed.error}`)
      continue
    }
    const { patch } = parsed
    const existing = defs.get(name)
    if (existing === undefined) {
      if (patch.match === undefined || patch.style === undefined) {
        log(`rule "${name}" skipped: a new rule needs match and style`)
      } else defs.set(name, { kind: 'custom', ...patch, match: patch.match })
      continue
    }
    defs.set(name, {
      ...existing,
      ...patch,
      style: { ...existing.style, ...patch.style },
      dark: { ...existing.dark, ...patch.dark },
      light: { ...existing.light, ...patch.light },
    })
  }
  // Compile every rule; a bad override falls back to the built-in it patched.
  return [...defs].flatMap(([name, def]) => {
    const rule = compile(name, def, log, mode)
    if (rule !== undefined || !builtin.has(name)) return rule ?? []
    const { name: _n, ...original } = BUILTIN.find(b => b.name === name)!
    return compile(name, original, log, mode) ?? []
  })
}

/**
 * The marker a rule's match stands for, when the pattern is literal text
 * (punctuation escaped, `\(recommended\)` is `(recommended)`), so the prompt
 * can name it: `anchored` when it must open the label (`^⚠`), for "start a
 * node with ⚠". Undefined for any other pattern.
 */
export const markerOf = (rule: Rule): { text: string; anchored: boolean } | undefined => {
  const m = /^(\^?)((?:\\[^\w\s]|[^\\^$.|?*+()[\]{}])+)$/.exec(rule.def.match)
  if (m === null) return undefined
  const text = m[2]!.replace(/\\([^\w\s])/g, '$1').trim()
  return text === '' ? undefined : { text, anchored: m[1] === '^' }
}
