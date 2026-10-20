import type { Register } from 'claude-code'

import { labelRuns, pathHref, prefixRuns, resolvePath, tokenize, type Run } from './highlight'
import { layoutTree, splitParts, type Row } from './lib'
import { paletteFor, type Palette } from './palette'

export const register: Register = on => {
  // The palette follows the theme setting: read once, then again after the
  // theme changes, which redraws the trees already on screen.
  let palette: Palette | undefined
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    palette = undefined
    $.ui.invalidate('ui.render')
    return result
  })

  // In the transcript: a reply's ```-fenced trees draw in the palette, each
  // guide in the color of the node it descends from, labels highlighted, and
  // wrapped under their own branches when wider than the screen; the stored
  // message is untouched.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isSummary) return next(e)
    const room = (e.viewport?.columns ?? 0) - 4
    if (room <= 0) return next(e)
    const parts = splitParts(e.props.text)
    if (!parts.some(part => part.kind === 'tree')) return next(e)

    // Lay every tree out first: any that does not parse leaves it to the engine.
    const laid: (Row[] | string)[] = []
    for (const part of parts) {
      if (part.kind === 'prose') {
        laid.push(part.text)
        continue
      }
      let rows: Row[] | undefined
      try {
        rows = layoutTree(part.text, room)
      } catch {
        rows = undefined
      }
      if (rows === undefined) return next(e)
      laid.push(rows)
    }

    // Paths link to their file:// URL, so a click opens a directory in the
    // file manager. Not in an IDE's terminal (Cursor and VS Code both set
    // TERM_PROGRAM=vscode): it links path text itself and opens it in the
    // editor, which a link of ours would take over.
    // Unreadable environment: draw paths plain.
    const env = async (read: () => Promise<string | undefined>) => {
      try {
        return await read()
      } catch {
        return undefined
      }
    }
    const term = await env(() => $.env.get('TERM_PROGRAM'))
    const linking = term !== undefined && term !== 'vscode'
    const home = linking ? await env(() => $.env.get('HOME')) : undefined
    // A relative path links when it exists under the session's directory:
    // a guess at its base never becomes a broken link.
    const cwd = linking ? await env(() => $.session.cwd()) : undefined
    const relative = new Set<string>()
    if (cwd !== undefined) {
      const written = laid
        .flatMap(part => (typeof part === 'string' ? [] : part))
        .filter(row => row.role !== 'root')
        .flatMap(row => tokenize(row.whole))
        .filter(t => t.kind === 'path' && pathHref(t.text, home) === undefined)
        .map(t => t.text)
      await Promise.all(
        [...new Set(written)].map(async text => {
          const abs = resolvePath(text, home, cwd)
          if (abs !== undefined && (await $.fs.exists(abs).catch(() => false))) relative.add(text)
        }),
      )
    }
    // A run links when it is a whole path token of its node's label: a path a
    // wrap split across rows would link to a fragment of itself.
    const href = (row: Row, run: Run): string | undefined => {
      if (!linking || row.role === 'root') return undefined
      if (!tokenize(row.whole).some(t => t.kind === 'path' && t.text === run.text)) return undefined
      return pathHref(run.text, home, relative.has(run.text) ? cwd : undefined)
    }

    // Unreadable settings: the dark palette, as before themes.
    if (palette === undefined) {
      let theme: unknown
      try {
        theme = (await $.config.list()).find(row => row.key === 'theme')?.value
      } catch {
        theme = undefined
      }
      palette = paletteFor(theme)
    }
    const drawn = palette

    const { Box, Text, Link, Markdown } = $.ui.resolve(e)
    const runs = (row: Row): Run[] => [...prefixRuns(row, drawn), ...labelRuns(row, drawn)]
    return (
      <Box flexDirection="column">
        {laid.map(part =>
          typeof part === 'string' ? (
            <Markdown text={part} />
          ) : (
            <Box flexDirection="column">
              {part.map(row =>
                row.prefix === '' && row.label === '' ? (
                  <Text> </Text>
                ) : (
                  <Text wrap="truncate-end">
                    {runs(row).map(run => {
                      const to = href(row, run)
                      const text = <Text {...run.style}>{run.text}</Text>
                      return to === undefined ? text : <Link href={to}>{text}</Link>
                    })}
                  </Text>
                ),
              )}
            </Box>
          ),
        )}
      </Box>
    )
  })
}
