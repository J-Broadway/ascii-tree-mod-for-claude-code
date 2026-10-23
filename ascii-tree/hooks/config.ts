// The user's side of the mod: `~/.claude/ascii-tree/config.json` (palette
// overrides and highlight rules) and `preferences.md` (prose for the tree
// prompt). Both live outside the plugin, whose installed folder is replaced
// by every update. Pure: reading the files is `register.tsx`'s job, so all of
// this is testable on strings.
//
// Fail safe by construction: nothing here throws. Unreadable JSON is the
// defaults; an invalid palette role or rule is skipped (logged) and the rest
// still apply.

import { paletteFor, parseStyle, type Palette, type Style } from './palette'
import { DEFAULT_RULES } from './highlight'
import { compileRules, markerOf, type Mode, type Rule } from './rules'

type Log = (msg: string) => void

/** The palette roles that are one style each (`depth` is a list, handled apart). */
export const STYLE_ROLES = ['seed', 'leafKey', 'code', 'path', 'number', 'quote', 'arrow', 'attention', 'codeBlock'] as const
type StyleRole = (typeof STYLE_ROLES)[number]

/** A theme's overrides: per role, the keys to change. `depth[i]` patches depth level i+1. */
export type PaletteOverride = Partial<Record<StyleRole, Style>> & { depth?: Style[] }

/** A parsed, validated config. Highlights stay raw: `compileRules` validates them rule by rule. */
export type UserConfig = {
  palette: { dark: PaletteOverride; light: PaletteOverride }
  highlights: Record<string, unknown>
}

export const EMPTY_CONFIG: UserConfig = { palette: { dark: {}, light: {} }, highlights: {} }

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const parseOverride = (value: unknown, where: string, log: Log): PaletteOverride => {
  if (!isObject(value)) {
    log(`${where} skipped: must be an object`)
    return {}
  }
  const out: Record<string, unknown> = {}
  for (const [role, v] of Object.entries(value)) {
    if (role === 'depth') {
      if (!Array.isArray(v)) {
        log(`${where}.depth skipped: must be a list of styles`)
        continue
      }
      out.depth = v.map((entry, i): Style => {
        const parsed = parseStyle(entry)
        if ('error' in parsed) {
          log(`${where}.depth[${i}] skipped: ${parsed.error}`)
          return {}
        }
        return parsed.style
      })
    } else if ((STYLE_ROLES as readonly string[]).includes(role)) {
      const parsed = parseStyle(v)
      if ('error' in parsed) log(`${where}.${role} skipped: ${parsed.error}`)
      else out[role] = parsed.style
    } else {
      log(`${where}.${role} skipped: unknown role (allowed: ${[...STYLE_ROLES, 'depth'].join(', ')})`)
    }
  }
  return out as PaletteOverride
}

/** Reads config.json's text; undefined or anything unreadable is the empty config. */
export const parseConfig = (text: string | undefined, log: Log = () => {}): UserConfig => {
  if (text === undefined || text.trim() === '') return EMPTY_CONFIG
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    log(`config.json ignored: not valid JSON (${error instanceof Error ? error.message : String(error)})`)
    return EMPTY_CONFIG
  }
  if (!isObject(json)) {
    log('config.json ignored: top level must be an object')
    return EMPTY_CONFIG
  }
  const config: UserConfig = { palette: { dark: {}, light: {} }, highlights: {} }
  for (const [key, value] of Object.entries(json)) {
    if (key === 'palette') {
      if (!isObject(value)) {
        log('palette skipped: must be an object with "dark" and/or "light"')
        continue
      }
      for (const [mode, override] of Object.entries(value)) {
        if (mode === 'dark' || mode === 'light') config.palette[mode] = parseOverride(override, `palette.${mode}`, log)
        else log(`palette.${mode} skipped: only "dark" and "light"`)
      }
    } else if (key === 'highlights') {
      if (isObject(value)) config.highlights = value
      else log('highlights skipped: must be an object of named rules')
    } else {
      log(`"${key}" ignored: unknown top-level key (allowed: palette, highlights)`)
    }
  }
  return config
}

/**
 * A palette with an override merged in, per role and key by key, so a role
 * keeps what the override does not set (a purple path stays underlined).
 * `depth` patches level by level: entries beyond the built-in list extend it
 * from the last level. With nothing to override it is `base` itself.
 */
export const applyPalette = (base: Palette, override: PaletteOverride): Palette => {
  if (Object.keys(override).length === 0) return base
  const out: Palette = { ...base }
  for (const role of STYLE_ROLES) {
    const patch = override[role]
    if (patch !== undefined) out[role] = { ...base[role], ...patch }
  }
  if (override.depth !== undefined) {
    const patched = base.depth.map((style, i) => ({ ...style, ...override.depth![i] }))
    const last = base.depth[base.depth.length - 1] ?? base.seed
    for (let i = base.depth.length; i < override.depth.length; i++) patched.push({ ...last, ...override.depth[i] })
    out.depth = patched
  }
  return out
}

/** What the tree is drawn with: a palette and the highlight rules. */
export type Look = { palette: Palette; rules: readonly Rule[] }

/** The look for a `theme` setting under a user config: the light overrides for a light theme, else the dark. */
export const resolveLook = (theme: unknown, config: UserConfig, log: Log = () => {}): Look => {
  const base = paletteFor(theme)
  const mode: Mode = typeof theme === 'string' && theme.startsWith('light') ? 'light' : 'dark'
  return {
    palette: applyPalette(base, config.palette[mode]),
    rules: rulesOf(config, log, mode),
  }
}

/** The rules a config puts in force on a theme: the built-ins alone when it sets no highlights. */
export const rulesOf = (config: UserConfig, log: Log = () => {}, mode: Mode = 'dark'): readonly Rule[] =>
  Object.keys(config.highlights).length === 0 ? DEFAULT_RULES : compileRules(config.highlights, log, mode)

/**
 * The tree prompt's marker list: one line per rule in force that says `when`
 * to use it. A rule anchored on a literal (`^⚠`) reads "start a node with
 * ⚠ for ..."; any other names the pattern the mod highlights. Undefined when
 * no rule has a `when`.
 */
export const markerGuide = (rules: readonly Rule[]): string | undefined => {
  const lines = rules.flatMap(rule => {
    const when = rule.def.when
    if (when === undefined) return []
    const marker = markerOf(rule)
    return [
      marker !== undefined
        ? `- Start a node with \`${marker}\` only for ${when}.`
        : `- Text matching /${rule.def.match}/${rule.def.ignoreCase === true ? 'i' : ''} is highlighted (${rule.name}): write it for ${when}.`,
    ]
  })
  if (lines.length === 0) return undefined
  return `## Highlight markers\nThe mod highlights these; use each only where it fits:\n${lines.join('\n')}`
}

/** The command's prompt with the marker list appended; unchanged when there is none. */
export const withMarkers = (prompt: string, rules: readonly Rule[]): string => {
  const guide = markerGuide(rules)
  return guide === undefined ? prompt : `${prompt.trimEnd()}\n\n${guide}\n`
}

/** The most preferences.md text added to a prompt, so a runaway file cannot flood the model's context. */
export const MAX_PREFERENCES = 8000

/**
 * The command's prompt with the user's preferences appended under a heading
 * that says they win. Empty or missing preferences leave the prompt as it was.
 */
export const withPreferences = (prompt: string, preferences: string | undefined): string => {
  const text = preferences?.trim() ?? ''
  if (text === '') return prompt
  return `${prompt.trimEnd()}\n\n## User preferences (these override the defaults above)\n${text.slice(0, MAX_PREFERENCES)}\n`
}

/** Where a user file lives: `<home>/.claude/ascii-tree/<name>`. Undefined without a home. */
export const userPath = (home: string | undefined, name: string): string | undefined =>
  home === undefined || home === '' ? undefined : `${home.replace(/\/$/, '')}/.claude/ascii-tree/${name}`
