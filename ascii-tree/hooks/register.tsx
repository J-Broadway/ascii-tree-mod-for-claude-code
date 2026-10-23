import type { Register } from 'claude-code'

import { labelRuns, pathHref, prefixRuns, resolvePath, shellPath, tokenize, type Run } from './highlight'
import { layoutTree, splitCode, splitParts, type Piece, type Row } from './lib'
import {
  EMPTY_CONFIG,
  parseConfig,
  resolveLook,
  rulesOf,
  userPath,
  withMarkers,
  withPreferences,
  type Look,
  type UserConfig,
} from './config'

export const register: Register = (on, options) => {
  // `pathCopy` (a /config row): a copy control after each path. `auto` draws
  // them only where a path can't be clicked; `on` everywhere; `off` never.
  const pathCopy = options.pathCopy === 'on' || options.pathCopy === 'off' ? options.pathCopy : 'auto'
  // Copy controls pressed in the last 2 seconds, by key: they read "copied".
  const copied = new Set<string>()
  // The look (palette and highlight rules) follows the theme setting and the
  // user's config.json: resolved once, again after the theme changes (which
  // redraws the trees already on screen), and again whenever config.json's
  // modification time changes, so an edit, an agent's included, shows in the
  // next tree drawn without a restart. The check is one stat per render.
  let look: Look | undefined
  let config: UserConfig = EMPTY_CONFIG
  // The config file's mtime as last read; `null` = read and absent, undefined = not read yet.
  let seen: number | null | undefined
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    look = undefined
    $.ui.invalidate('ui.render')
    return result
  })

  // The user's files live outside the plugin, in the Claude config folder, so
  // an update (a fresh versioned plugin folder) never touches them. The
  // helpers take the few engine calls they need as functions: a hook's `$` is
  // only ever spelled `$.noun.event(...)`, never passed around.
  type Io = {
    home: () => Promise<string | undefined>
    stat: (path: string) => Promise<number>
    read: (path: string) => Promise<string>
    theme: () => Promise<unknown>
    log: (msg: string) => void
  }
  const userFile = async (io: Pick<Io, 'home'>, name: string): Promise<string | undefined> => {
    try {
      return userPath(await io.home(), name)
    } catch {
      return undefined
    }
  }

  // Re-reads config.json when its mtime moved; true when it changed after the first read.
  const refreshConfig = async (io: Io): Promise<boolean> => {
    const path = await userFile(io, 'config.json')
    let mtime: number | null = null
    if (path !== undefined) {
      try {
        mtime = await io.stat(path)
      } catch {
        mtime = null
      }
    }
    if (mtime === seen) return false
    const first = seen === undefined
    seen = mtime
    let text: string | undefined
    if (path !== undefined && mtime !== null) {
      try {
        text = await io.read(path)
      } catch {
        text = undefined
      }
    }
    config = parseConfig(text, io.log)
    look = undefined
    return !first
  }

  // Unreadable settings: the dark palette, as before themes. A config that
  // somehow breaks resolution leaves the defaults rather than the render.
  const currentLook = async (io: Io): Promise<Look> => {
    if (look !== undefined) return look
    let theme: unknown
    try {
      theme = await io.theme()
    } catch {
      theme = undefined
    }
    try {
      look = resolveLook(theme, config, io.log)
    } catch {
      look = resolveLook(theme, EMPTY_CONFIG)
    }
    return look
  }

  // The tree commands' prompt carries the user's side too: the marker list
  // (every rule in force with a `when`, so a marker a user adds is one the
  // model knows to write), then preferences.md. A file that is missing or
  // unreadable adds nothing; the built-in markers are listed regardless.
  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    // Plugin commands may be reported bare (`tree`) or namespaced
    // (`ascii-tree:tree`); another plugin's own `tree` is left alone.
    const ours =
      e.pluginName !== undefined
        ? e.pluginName === 'ascii-tree'
        : /^(?:ascii-tree:)?(?:tree|ascii-tree)$/.test(e.skill)
    if (!ours) return result
    const home = { home: () => $.env.get('HOME') }
    const read = async (name: string): Promise<string | undefined> => {
      const path = await userFile(home, name)
      if (path === undefined) return undefined
      try {
        return await $.fs.read(path)
      } catch {
        return undefined
      }
    }
    let text = result.text
    try {
      text = withMarkers(text, rulesOf(parseConfig(await read('config.json'))))
    } catch {
      // A config that can't be read lists no markers rather than break the command.
    }
    return { text: withPreferences(text, await read('preferences.md')) }
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

    // The user's config, before anything is drawn. Unreadable: the defaults.
    const io: Io = {
      home: () => $.env.get('HOME'),
      stat: async path => (await $.fs.stat(path)).mtimeMs,
      read: path => $.fs.read(path),
      theme: async () => (await $.config.list()).find(row => row.key === 'theme')?.value,
      log: msg => {
        try {
          $.ui.log(`ascii-tree: ${msg}`, { to: 'debug' })
        } catch {
          // Logging is a courtesy.
        }
      },
    }
    let changed = false
    try {
      changed = await refreshConfig(io)
    } catch {
      config = EMPTY_CONFIG
    }
    if (changed) $.ui.invalidate('ui.render')
    const { palette: drawn, rules } = await currentLook(io)

    // Paths link to their file:// URL, so a click opens a directory in the
    // file manager. Not in an IDE's terminal (Cursor and VS Code both set
    // TERM_PROGRAM=vscode): it links path text itself and opens it in the
    // editor, which a link of ours would take over. Not in macOS Terminal
    // either: it has no OSC 8 links, so the engine would print each URL after
    // its path. Unreadable environment: draw paths plain.
    const env = async (read: () => Promise<string | undefined>) => {
      try {
        return await read()
      } catch {
        return undefined
      }
    }
    const term = await env(() => $.env.get('TERM_PROGRAM'))
    const selfLinking = term === 'vscode'
    const linking = term !== undefined && !selfLinking && term !== 'Apple_Terminal'
    // In fullscreen, where clicks reach the drawing, code blocks get a copy
    // control, and paths too where `pathCopy` asks: each takes 2 columns.
    const clickable = e.viewport?.isFullscreen === true
    const pathCopies = clickable && (pathCopy === 'on' || (pathCopy === 'auto' && !linking && !selfLinking))

    // Lay every tree out first: any that does not parse leaves it to the engine.
    // Prose keeps its code fences apart, to draw them as blocks.
    const laid: (Row[] | Piece)[] = []
    for (const part of parts) {
      if (part.kind === 'prose') {
        laid.push(...splitCode(part.text))
        continue
      }
      let rows: Row[] | undefined
      try {
        rows = layoutTree(part.text, pathCopies ? room - 2 : room, part.code)
      } catch {
        rows = undefined
      }
      if (rows === undefined) return next(e)
      laid.push(rows)
    }

    const home = linking ? await env(() => $.env.get('HOME')) : undefined
    // A relative path links when it exists under the session's directory:
    // a guess at its base never becomes a broken link.
    const cwd = linking ? await env(() => $.session.cwd()) : undefined
    const relative = new Set<string>()
    if (cwd !== undefined) {
      const written = laid
        .flatMap(part => (Array.isArray(part) ? part : []))
        .filter(row => row.role !== 'root' && row.role !== 'code')
        .flatMap(row => tokenize(row.whole, rules))
        .filter(t => t.kind === 'path' && pathHref(t.text, home) === undefined)
        .map(t => t.text)
      await Promise.all(
        [...new Set(written)].map(async text => {
          const abs = resolvePath(text, home, cwd)
          if (abs !== undefined && (await $.fs.exists(abs).catch(() => false))) relative.add(text)
        }),
      )
    }
    // A path run links to its whole token, so each piece of a path a wrap
    // split across rows opens the same place.
    const href = (row: Row, run: Run): string | undefined => {
      if (!linking || row.role === 'root' || run.path === undefined) return undefined
      return pathHref(run.path, home, relative.has(run.path) ? cwd : undefined)
    }

    const { Box, Text, Link, Markdown, Code, Button } = $.ui.resolve(e)
    const runs = (row: Row): Run[] => [...prefixRuns(row, drawn), ...labelRuns(row, drawn, rules)]
    // Fullscreen passes clicks to the drawing, so each code block gets a copy
    // control there; elsewhere a click is the terminal's, and /copy picks blocks.
    let copies = 0
    // Right-aligned, so it reads as the block's control rather than its text;
    // a press says "copied" in place for 2 seconds (a failure, in a toast).
    const control = (key: string, text: string, labels: readonly [string, string]) => (
      <Button
        key={key}
        label={copied.has(key) ? labels[1] : labels[0]}
        plain
        dimColor
        onPress={async press => {
          const done = await $.ui.copy({ text, surface: press.surface })
          if (!done.isCopied) {
            $.ui.toast('Could not copy')
            return
          }
          copied.add(key)
          $.ui.invalidate('ui.render')
          $.clock.after(2000, () => {
            copied.delete(key)
            $.ui.invalidate('ui.render')
          })
        }}
      />
    )
    const copyButton = (text: string) => (
      <Box flexGrow={1} justifyContent="flex-end">
        {control(`copy:${e.requestId}:${copies++}`, text, ['⧉ copy', '✓ copied'])}
      </Box>
    )
    // A path's control goes after its last piece: a path a wrap split is
    // copied whole, from the row where it ends.
    let pathKeys = 0
    const endsHere = (run: Run): boolean => run.path !== undefined && run.cut === undefined
    const drawRun = (row: Row, run: Run) => {
      const to = href(row, run)
      // Underlined means clickable: a path we can't link drops its
      // underline, unless an IDE's terminal links it itself. Any other run
      // keeps an underline its style asks for.
      const { underline, ...rest } = run.style
      const style = to === undefined && run.path !== undefined && !selfLinking ? rest : run.style
      const text = <Text {...style}>{run.text}</Text>
      return to === undefined ? text : <Link href={to}>{text}</Link>
    }
    // A row's runs as one Text; with path controls, cut after each path
    // that ends in it, the control between the pieces.
    const drawRow = (row: Row) => {
      const all = runs(row)
      if (!pathCopies || row.role === 'root') return <Text wrap="truncate-end">{all.map(run => drawRun(row, run))}</Text>
      const pieces: JSX.Element[] = []
      let held: Run[] = []
      for (const run of all) {
        held.push(run)
        if (!endsHere(run)) continue
        pieces.push(<Text>{held.map(r => drawRun(row, r))}</Text>, <Text> </Text>)
        // Copied ready for a shell: spaces and the like escaped.
        pieces.push(control(`path:${e.requestId}:${pathKeys++}`, shellPath(run.path!), ['⧉', '✓']))
        held = []
      }
      if (pieces.length === 0) return <Text wrap="truncate-end">{all.map(run => drawRun(row, run))}</Text>
      if (held.length > 0) pieces.push(<Text>{held.map(r => drawRun(row, r))}</Text>)
      return <Box flexDirection="row">{pieces}</Box>
    }
    // A blank row between parts, so a command block after a tree stands apart.
    return (
      <Box flexDirection="column" gap={1}>
        {laid.map(part =>
          !Array.isArray(part) ? (
            part.kind === 'prose' ? (
              <Markdown text={part.text} />
            ) : (
              // The engine's highlighter colors the tokens; codeBlock lays its
              // background behind them. No gutter, so a selection copies the bare code.
              <Box flexDirection="column">
                <Box backgroundColor={drawn.codeBlock.backgroundColor}>
                  <Code source={part.text} language={part.lang} />
                </Box>
                {clickable && copyButton(part.text)}
              </Box>
            )
          ) : (
            <Box flexDirection="column">
              {part.flatMap(row => [
                row.prefix === '' && row.label === '' ? (
                  <Text> </Text>
                ) : (
                  drawRow(row)
                ),
                // Under a code block in the tree: the control, behind the block's guides.
                ...(clickable && row.copy !== undefined
                  ? [
                      <Box flexDirection="row">
                        {prefixRuns(row, drawn).map(run => (
                          <Text {...run.style}>{run.text}</Text>
                        ))}
                        {copyButton(row.copy)}
                      </Box>,
                    ]
                  : []),
              ])}
            </Box>
          ),
        )}
      </Box>
    )
  })
}
