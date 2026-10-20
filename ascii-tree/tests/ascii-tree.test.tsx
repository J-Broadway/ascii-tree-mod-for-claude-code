import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { labelRuns, leafKey, pathHref, prefixRuns, resolvePath, tokenize } from '../hooks/highlight'
import { classify, continuations, isTree, layoutTree, normalizeIndent, splitParts, wrapTreeLine } from '../hooks/lib'
import { LINEAGE, LINEAGE_LIGHT, paletteFor } from '../hooks/palette'

const SEED = '#8B5A2B'
const TAN = '#C8A165'
const D2 = '#C27C5B'
const D3 = '#B07888'
const D4 = '#9A8C80'
const LEAF = '#6A9F4A'
const PATH = '#5B9BD5'
const NUM = '#D4A23A'

const LIGHT_TREE = [
  'root',
  '├── alpha-branch-with-a-very-long-name-that-goes-past-the-edge',
  '│   └── leaf',
  '└── omega',
].join('\n')

const HEAVY_TREE = [
  '● Title',
  '┃',
  '┣━━ Top branch',
  '┃    ├── child branch',
  '┃    │    └── leaf',
  '┃    └── leaf',
  '┃',
  '┗━━ Last top branch',
  '       └── leaf',
].join('\n')

const DEEP_TREE = [
  '● Title',
  '┃',
  '┣━━ Top',
  '┃    ├── Second',
  '┃    │    ├── Third',
  '┃    │    │    └── deep leaf',
  '┃    │    └── leaf',
  '┃    └── leaf',
  '┃',
  '┗━━ loose leaf',
].join('\n')

const fence = (body: string) => `\`\`\`\n${body}\n\`\`\``

const message = (text: string) =>
  ({
    plugin: 'ascii-tree',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'msg-1',
    props: { text, isFirstOfReply: true },
  }) as const

test('lib: wraps tree lines under their own branch', async () => {
  expect(wrapTreeLine('├── short', 20)).toEqual(['├── short'])
  expect(wrapTreeLine('│   └── one two three four five', 20)).toEqual([
    '│   └── one two',
    '│       three four',
    '│       five',
  ])
  expect(wrapTreeLine('├── abcdefghijklmnopqrstuvwxyz', 20)).toEqual([
    '├── abcdefghijklmnop',
    '│   qrstuvwxyz',
  ])
})

test('lib: continuation rows carry the heavy and light guides on', async () => {
  expect(wrapTreeLine('┣━━ one two three four five six', 20)).toEqual([
    '┣━━ one two three',
    '┃   four five six',
  ])
  expect(wrapTreeLine('┃    │    ├── one two three four five', 28)).toEqual([
    '┃    │    ├── one two three',
    '┃    │    │   four five',
  ])
  expect(wrapTreeLine('┃    └── one two three four five six', 24)).toEqual([
    '┃    └── one two three',
    '┃        four five six',
  ])
  expect(wrapTreeLine('┗━━ one two three four five six', 20)).toEqual([
    '┗━━ one two three',
    '    four five six',
  ])
})

test('lib: detects heavy, light and old ├─ trees; leaves other blocks alone', async () => {
  expect(isTree(HEAVY_TREE)).toBe(true)
  expect(isTree(LIGHT_TREE)).toBe(true)
  expect(isTree('src\n├─ a.ts\n└─ b.ts')).toBe(true)
  expect(isTree('const x = 1\nconsole.log(x)')).toBe(false)
  expect(isTree('┌───┬───┐\n│ a │ b │\n├───┼───┤\n└───┴───┘')).toBe(false)
  expect(isTree('├────────┤')).toBe(false)
  const parts = splitParts(`intro\n\n${fence('let a = 1')}\n\n${fence(HEAVY_TREE)}\nafter`)
  expect(parts.map(p => p.kind)).toEqual(['prose', 'tree', 'prose'])
  expect(parts[0]?.text).toContain('let a = 1')
})

test('lib: classifies root, top, branch and leaf structurally', async () => {
  expect(classify(HEAVY_TREE.split('\n'))).toEqual([
    'root',
    'guide',
    'top',
    'branch',
    'leaf',
    'leaf',
    'guide',
    'top',
    'leaf',
  ])
  expect(classify(LIGHT_TREE.split('\n'))).toEqual(['root', 'top', 'leaf', 'top'])
  expect(classify(['no branches here'])).toBeUndefined()
})

test('lib: layout splits guides from labels and wraps under the label', async () => {
  const rows = layoutTree('┣━━ Top branch with a long name\n┃    └── leaf', 20)
  expect(rows?.map(({ prefix, label, role, connector, first }) => ({ prefix, label, role, connector, first }))).toEqual([
    { prefix: '┣━━ ', label: 'Top branch with', role: 'top', connector: 0, first: true },
    { prefix: '┃   ', label: 'a long name', role: 'top', connector: -1, first: false },
    { prefix: '┃    └── ', label: 'leaf', role: 'leaf', connector: 5, first: true },
  ])
  expect(rows?.map(r => [r.depth, r.hasChildren, [...r.owners]])).toEqual([
    [1, true, [0]],
    [1, true, [0]],
    [2, false, [0, , , , , 1]],
  ])
})

const rowsOf = (tree: string, cols = 200) => layoutTree(tree, cols) ?? []
/** The color of each glyph column of a row's prefix, spaces skipped. */
const glyphColors = (runs: { text: string; style: { color?: string } }[]) =>
  runs.flatMap(r => Array.from(r.text).filter(ch => ch !== ' ').map(ch => [ch, r.style.color]))

/** The color of each glyph cell of a row's prefix, spaces skipped. */
const prefixOf = (rows: ReturnType<typeof rowsOf>, i: number) => glyphColors(prefixRuns(rows[i]!, LINEAGE))

test('pipes: every guide glyph takes the color of the parent owning its column', async () => {
  const rows = rowsOf(DEEP_TREE)
  const prefix = (i: number) => prefixOf(rows, i)
  // The spine and a top-level ┣━━ to a branch: the root's, seed brown.
  expect(prefix(1)).toEqual([['┃', SEED]])
  expect(prefix(2)).toEqual([['┣', SEED], ['━', SEED], ['━', SEED]])
  // Depth 1 owns its children's connectors: ├── to Second is tan.
  expect(prefix(3)).toEqual([['┃', SEED], ['├', TAN], ['─', TAN], ['─', TAN]])
  // Depth 2 owns its children's: ├── to Third is d2; │ before it Top's tan.
  expect(prefix(4)).toEqual([['┃', SEED], ['│', TAN], ['├', D2], ['─', D2], ['─', D2]])
  // Depth 3 owns its children's: └── to the deep leaf is d3, whole.
  expect(prefix(5)).toEqual([
    ['┃', SEED], ['│', TAN], ['│', D2], ['└', D3], ['─', D3], ['─', D3],
  ])
  expect(prefix(6)).toEqual([['┃', SEED], ['│', TAN], ['└', D2], ['─', D2], ['─', D2]])
  expect(prefix(7)).toEqual([['┃', SEED], ['└', TAN], ['─', TAN], ['─', TAN]])
  // A leaf straight under the root: ┗━━ all seed; plain text.
  expect(prefix(9)).toEqual([['┗', SEED], ['━', SEED], ['━', SEED]])
  expect(labelRuns(rows[9]!, LINEAGE)).toEqual([{ text: 'loose leaf', style: {} }])
})

test('pipes: light, heavy and old short connectors are one color, to leaves and branches alike', async () => {
  const old = rowsOf('src\n├─ a.ts\n└─ lib\n   └─ b.ts')
  expect(prefixOf(old, 1)).toEqual([['├', SEED], ['─', SEED]])
  expect(prefixOf(old, 2)).toEqual([['└', SEED], ['─', SEED]])
  expect(prefixOf(old, 3)).toEqual([['└', TAN], ['─', TAN]])
  const heavy = rowsOf('● T\n┣━━ leaf one\n┗━━ Branch\n     └── leaf')
  expect(prefixOf(heavy, 1)).toEqual([['┣', SEED], ['━', SEED], ['━', SEED]])
  expect(prefixOf(heavy, 2)).toEqual([['┗', SEED], ['━', SEED], ['━', SEED]])
  expect(prefixOf(heavy, 3)).toEqual([['└', TAN], ['─', TAN], ['─', TAN]])
})

test('lineage: seed, branch labels by depth, leaves plain', async () => {
  const rows = rowsOf(DEEP_TREE)
  expect(labelRuns(rows[0]!, LINEAGE)).toEqual([{ text: '● Title', style: { color: SEED, weight: 'bold' } }])
  expect(labelRuns(rows[2]!, LINEAGE)[0]?.style).toEqual({ color: TAN, weight: 'bold' })
  expect(labelRuns(rows[3]!, LINEAGE)[0]?.style).toEqual({ color: D2, weight: 'bold' })
  expect(labelRuns(rows[4]!, LINEAGE)[0]?.style).toEqual({ color: D3, weight: 'bold' })
  expect(labelRuns(rows[5]!, LINEAGE)).toEqual([{ text: 'deep leaf', style: {} }])
  // A depth-4 branch: stone.
  expect(labelRuns(rowsOf('r\n└── a\n    └── b\n        └── c\n            └── d\n                └── e')[4]!, LINEAGE)[0]?.style)
    .toEqual({ color: D4, weight: 'bold' })
})

/** Hue in degrees of a #RRGGBB color. */
const hue = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

test('palette: branch depths are warm/neutral, never leaf green', async () => {
  const depths = LINEAGE.depth.map(d => d.color)
  expect(depths).toEqual([TAN, D2, D3, D4])
  for (const color of depths) {
    // Not leaf green, seed brown, amber numbers or path blue.
    expect([LEAF, SEED, NUM, PATH]).not.toContain(color)
    // No green hue (leaf green is ~97°): outside 60°–180°.
    const h = hue(color!)
    expect(h < 60 || h > 180).toBe(true)
  }
  expect(LINEAGE.leafKey.color).toBe(LEAF)
  expect('leafConnector' in LINEAGE).toBe(false)
  expect('term' in LINEAGE).toBe(false)
})

test('old light-only trees: the root and its guides are the seed', async () => {
  const rows = rowsOf(LIGHT_TREE)
  expect(labelRuns(rows[0]!, LINEAGE)[0]?.style).toEqual({ color: SEED, weight: 'bold' })
  // The connector to a depth-1 branch is the root's: seed.
  expect(prefixOf(rows, 1)).toEqual([['├', SEED], ['─', SEED], ['─', SEED]])
  expect(labelRuns(rows[1]!, LINEAGE)[0]?.style).toEqual({ color: TAN, weight: 'bold' })
  expect(prefixOf(rows, 2)).toEqual([['│', SEED], ['└', TAN], ['─', TAN], ['─', TAN]])
  // A top-level node with no children is a leaf: seed connector, whole.
  expect(prefixOf(rows, 3)).toEqual([['└', SEED], ['─', SEED], ['─', SEED]])
  expect(labelRuns(rows[3]!, LINEAGE)).toEqual([{ text: 'omega', style: {} }])
})

test('wrapped rows keep each guide column in its owner color', async () => {
  const rows = rowsOf('● T\n┣━━ Top\n┃    ├── one two three four five six\n┃    └── end', 26)
  expect(rows.map(r => r.prefix + r.label)).toEqual([
    '● T',
    '┣━━ Top',
    '┃    ├── one two three',
    '┃    │   four five six',
    '┃    └── end',
  ])
  // The leaf's connector is Top's tan, whole; its continuation stem Top's.
  expect(prefixOf(rows, 2)).toEqual([['┃', SEED], ['├', TAN], ['─', TAN], ['─', TAN]])
  expect(prefixOf(rows, 3)).toEqual([['┃', SEED], ['│', TAN]])
  // A wrapped branch's stem stays the seed's spine; its label stays tan bold.
  const wrapped = rowsOf('● T\n┣━━ Top branch with a long name\n┃    └── leaf', 20)
  expect(prefixOf(wrapped, 2)).toEqual([['┃', SEED]])
  expect(labelRuns(wrapped[2]!, LINEAGE)[0]?.style).toEqual({ color: TAN, weight: 'bold' })
})

test('key: value leaves color a short key', async () => {
  expect(leafKey('local: ~/.claude/settings.json')).toBe('local:')
  expect(leafKey('max file size: 4 MiB')).toBe('max file size:')
  expect(leafKey('this is a longer sentence: with a colon')).toBeUndefined()
  expect(leafKey('see https://x.dev')).toBeUndefined()
  expect(leafKey('ratio 3:2 holds')).toBeUndefined()
  const row = rowsOf('r\n└── local: ~/.claude/x')[1]!
  expect(labelRuns(row, LINEAGE)).toEqual([
    { text: 'local:', style: { color: LEAF } },
    { text: ' ', style: {} },
    { text: '~/.claude/x', style: { color: PATH, underline: true } },
  ])
})

const kinds = (text: string) => tokenize(text).filter(t => t.kind).map(t => [t.text, t.kind])

test('tokens: code, paths, numbers, quotes and arrows', async () => {
  expect(kinds('run /review-instructions with --dry-run')).toEqual([
    ['/review-instructions', 'code'],
    ['--dry-run', 'code'],
  ])
  expect(kinds('use `claude plugin test` here')).toEqual([['claude plugin test', 'code']])
  expect(kinds('see ~/x/y, ./a.ts, ../b and /usr/local/bin.')).toEqual([
    ['~/x/y', 'path'],
    ['./a.ts', 'path'],
    ['../b', 'path'],
    ['/usr/local/bin', 'path'],
  ])
  expect(kinds('edit hooks/lib.ts and src/components/')).toEqual([
    ['hooks/lib.ts', 'path'],
    ['src/components/', 'path'],
  ])
  expect(kinds('docs at https://example.com/a?b=1.')).toEqual([['https://example.com/a?b=1', 'path']])
  expect(kinds('the 1600s, v0.2.0, 2026-10-20, 4 MiB, 12%')).toEqual([
    ['1600s', 'number'],
    ['v0.2.0', 'number'],
    ['2026-10-20', 'number'],
    ['4 MiB', 'number'],
    ['12%', 'number'],
  ])
  expect(kinds('called "the seam" here')).toEqual([['"the seam"', 'quote']])
  expect(kinds('a → b ⇒ c')).toEqual([['→', 'arrow'], ['⇒', 'arrow']])
})

test('tokens: no over-matching', async () => {
  expect(kinds('this and/or that')).toEqual([])
  expect(kinds('a / b')).toEqual([])
  expect(kinds('PIE *kad- root')).toEqual([])
  expect(kinds('utf8 x86 h1 3rd')).toEqual([])
  expect(kinds('well-known non-zero e-mail')).toEqual([])
  expect(kinds('BLOCKED TODO done')).toEqual([])
  // Unmatched backtick: left as text.
  expect(tokenize('a `b c')).toEqual([{ text: 'a `b c' }])
})

test('tokens inside a branch label keep the branch bold', async () => {
  const row = rowsOf('r\n├── Install v1.2.0\n│   └── x')[1]!
  expect(labelRuns(row, LINEAGE)).toEqual([
    { text: 'Install ', style: { color: TAN, weight: 'bold' } },
    { text: 'v1.2.0', style: { color: NUM, weight: 'bold' } },
  ])
})

test('a heavy tree is drawn in the lineage palette even when it fits', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...message(`Here:\n\n${fence(HEAVY_TREE)}\n`),
    viewport: { columns: 120, rows: 40 },
  })
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeUndefined()
  const texts = await ui.findAll({ type: 'Text' })
  const leaves = (text: string) => texts.filter(t => t.text === text && t.children.every(c => typeof c === 'string'))
  const leafText = (text: string) => leaves(text)[0]
  expect(leafText('● Title')?.props).toMatchObject({ color: SEED, weight: 'bold' })
  expect(leafText('Top branch')?.props).toMatchObject({ color: TAN, weight: 'bold' })
  expect(leafText('Last top branch')?.props).toMatchObject({ color: TAN })
  expect(leafText('child branch')?.props).toMatchObject({ color: D2, weight: 'bold' })
  expect(leafText('leaf')?.props.color).toBeUndefined()
  // Every connector, to a branch or a leaf, is one run in the parent's color.
  expect(leafText('┣━━ ')?.props).toMatchObject({ color: SEED })
  expect(leafText('┗━━ ')?.props).toMatchObject({ color: SEED })
  expect(leafText('├── ')?.props).toMatchObject({ color: TAN })
  expect(leaves('└── ').map(t => t.props.color)).toEqual([D2, TAN, TAN])
  // No split tip: no lone rule run, and no green anywhere in the guides.
  expect(leaves('└─')).toEqual([])
  expect(leaves('─ ')).toEqual([])
  expect(texts.filter(t => /[─━]/.test(t.text) && t.props.color === LEAF)).toEqual([])
  await ui.unmount()
})

test('a too-wide tree wraps with guides continuing in the prefix', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const narrow = await $.ui.mount({
    ...message(`Here it is:\n\n${fence(LIGHT_TREE)}\n`),
    viewport: { columns: 30, rows: 40 },
  })
  expect(await narrow.find({ type: 'Text', text: /engine/ })).toBeUndefined()
  expect((await narrow.findAll({ type: 'Text' })).map(t => t.text)).toEqual(
    expect.arrayContaining([
      '├── alpha-branch-with-a-ve',
      '│   ry-long-name-that-goes',
      '│   -past-the-edge',
      '│   └── leaf',
    ]),
  )
  await narrow.unmount()
})

test('replies without a tree, and summaries, are left to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const code = await $.ui.mount({
    ...message(`Code:\n\n${fence('const x = 1')}\n`),
    viewport: { columns: 120, rows: 40 },
  })
  expect((await code.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await code.unmount()

  const summary = await $.ui.mount({
    ...message(fence(HEAVY_TREE)),
    props: { text: fence(HEAVY_TREE), isFirstOfReply: true, isSummary: true },
    viewport: { columns: 120, rows: 40 },
  })
  expect((await summary.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await summary.unmount()

  const desktop = await $.ui.mount({
    ...message(fence(HEAVY_TREE)),
    surface: 'desktop',
    viewport: { columns: 120, rows: 40 },
  })
  expect((await desktop.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await desktop.unmount()
})

const FILES_TREE = [
  '● v0.3.0',
  '┃',
  '┣━━ Files',
  '┃    ├── new: hooks/palette.ts',
  '┃    │    └── typed Palette, one theme "LINEAGE"',
  '┃    ├── new: hooks/highlight.ts',
  '┃    │    └── token rules and key: split',
  '┃    └── backup: ~/…/scratchpad/ascii-tree-backup-0.2.0',
].join('\n')

test('pipes in FILES_TREE: connectors by parent, one color each', async () => {
  const rows = rowsOf(FILES_TREE)
  const prefix = (i: number) => prefixOf(rows, i)
  // Both `new:` branches hang from Files: ├── tan, whole.
  expect(prefix(3)).toEqual([['┃', SEED], ['├', TAN], ['─', TAN], ['─', TAN]])
  expect(prefix(5)).toEqual([['┃', SEED], ['├', TAN], ['─', TAN], ['─', TAN]])
  // The leaves under them: │ Files' tan, └── their parent's d2, whole.
  expect(prefix(4)).toEqual([['┃', SEED], ['│', TAN], ['└', D2], ['─', D2], ['─', D2]])
  expect(prefix(6)).toEqual([['┃', SEED], ['│', TAN], ['└', D2], ['─', D2], ['─', D2]])
  // backup: a leaf under Files.
  expect(prefix(7)).toEqual([['┃', SEED], ['└', TAN], ['─', TAN], ['─', TAN]])
})

test('bug B: a depth-2 branch label is bold d2 throughout, no key split', async () => {
  const rows = rowsOf(FILES_TREE)
  expect(labelRuns(rows[2]!, LINEAGE)).toEqual([{ text: 'Files', style: { color: TAN, weight: 'bold' } }])
  expect(labelRuns(rows[3]!, LINEAGE)).toEqual([
    { text: 'new: ', style: { color: D2, weight: 'bold' } },
    { text: 'hooks/palette.ts', style: { color: PATH, weight: 'bold', underline: true } },
  ])
  expect(labelRuns(rows[5]!, LINEAGE)[0]).toEqual({ text: 'new: ', style: { color: D2, weight: 'bold' } })
  // A leaf keeps its green key.
  expect(labelRuns(rows[7]!, LINEAGE)[0]).toEqual({ text: 'backup:', style: { color: LEAF } })
})

test('FILES_TREE in a mounted render', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...message(fence(FILES_TREE)), viewport: { columns: 120, rows: 40 } })
  const texts = await ui.findAll({ type: 'Text' })
  const leaves = (text: string) =>
    texts.filter(t => t.text === text && t.children.every(c => typeof c === 'string'))
  expect(leaves('├── ').map(t => t.props.color)).toEqual([TAN, TAN])
  expect(leaves('└── ').map(t => t.props.color)).toEqual([D2, D2, TAN])
  expect(leaves('─ ')).toEqual([])
  expect(leaves('│    ').map(t => t.props.color)).toEqual([TAN, TAN])
  expect(leaves('new: ').map(t => t.props)).toEqual([
    expect.objectContaining({ color: D2, weight: 'bold' }),
    expect.objectContaining({ color: D2, weight: 'bold' }),
  ])
  await ui.unmount()
})

test('pipes at depth 3 and 4: verticals by column owner, connectors by parent', async () => {
  const deeper = rowsOf('r\n└── a\n    └── b\n        └── c\n            ├── d\n            │   └── e\n            └── f')
  // ├── to d (depth 4) hangs from c (depth 3): d3.
  expect(prefixOf(deeper, 4)).toEqual([['├', D3], ['─', D3], ['─', D3]])
  // e's row: │ in c's column d3; └── d's color d4, whole.
  expect(prefixOf(deeper, 5)).toEqual([['│', D3], ['└', D4], ['─', D4], ['─', D4]])
  expect(prefixOf(deeper, 6)).toEqual([['└', D3], ['─', D3], ['─', D3]])
})

test('wrapped rows: continuation stems by column owner, connectors only on the first row', async () => {
  const rows = rowsOf(
    '● T\n┣━━ Top\n┃    ├── Branch with a long label here\n┃    │    └── leaf text that wraps over here\n┃    └── end',
    32,
  )
  expect(rows.map(r => r.prefix + r.label)).toEqual([
    '● T',
    '┣━━ Top',
    '┃    ├── Branch with a long',
    '┃    │   label here',
    '┃    │    └── leaf text that',
    '┃    │        wraps over here',
    '┃    └── end',
  ])
  const prefix = (i: number) => prefixOf(rows, i)
  expect(prefix(2)).toEqual([['┃', SEED], ['├', TAN], ['─', TAN], ['─', TAN]])
  // The branch's continuation stem sits in Top's column: tan; its text d2 bold.
  expect(prefix(3)).toEqual([['┃', SEED], ['│', TAN]])
  expect(labelRuns(rows[3]!, LINEAGE)).toEqual([{ text: 'label here', style: { color: D2, weight: 'bold' } }])
  expect(prefix(4)).toEqual([['┃', SEED], ['│', TAN], ['└', D2], ['─', D2], ['─', D2]])
  // The leaf's continuation: spine seed, Top's column tan, no connector.
  expect(prefix(5)).toEqual([['┃', SEED], ['│', TAN]])
  expect(labelRuns(rows[5]!, LINEAGE)).toEqual([{ text: 'wraps over here', style: {} }])
})

test('hex color tokens draw in their own color; #123 does not', async () => {
  expect(kinds('seed #8B5A2B, tan #C8A165, short #abc, alpha #8B5A2Bff')).toEqual([
    ['#8B5A2B', 'hex'],
    ['#C8A165', 'hex'],
    ['#abc', 'hex'],
    ['#8B5A2Bff', 'hex'],
  ])
  expect(kinds('all digits #123456')).toEqual([['#123456', 'hex']])
  // Issue refs and non-colors stay plain.
  expect(kinds('fixes #123 and #4567, see #12345678')).toEqual([])
  expect(kinds('a#abc x#8B5A2B #abcd #ghi #8B5A2Bz &#123;')).toEqual([])
  const leaf = rowsOf('r\n└── seed #8B5A2B and #abc, not #123')[1]!
  expect(labelRuns(leaf, LINEAGE)).toEqual([
    { text: 'seed ', style: {} },
    { text: '#8B5A2B', style: { color: '#8B5A2B' } },
    { text: ' and ', style: {} },
    { text: '#abc', style: { color: '#aabbcc' } },
    { text: ', not #123', style: {} },
  ])
  // In a branch label the hex keeps the branch bold.
  const branch = rowsOf('r\n├── link #5B9BD5\n│   └── x')[1]!
  expect(labelRuns(branch, LINEAGE)[1]).toEqual({ text: '#5B9BD5', style: { color: '#5B9BD5', weight: 'bold' } })
})

test('asterisks: *word* renders literally as plain text', async () => {
  expect(tokenize('*cadere* means to fall')).toEqual([{ text: '*cadere* means to fall' }])
  const leaf = rowsOf('r\n└── *cadere* means to fall')[1]!
  expect(labelRuns(leaf, LINEAGE)).toEqual([{ text: '*cadere* means to fall', style: {} }])
  const branch = rowsOf('r\n├── The *root* word\n│   └── x')[1]!
  expect(labelRuns(branch, LINEAGE)).toEqual([{ text: 'The *root* word', style: { color: TAN, weight: 'bold' } }])
  const keyed = rowsOf('r\n└── *cadere*: to fall')[1]!
  expect(labelRuns(keyed, LINEAGE)[0]).toEqual({ text: '*cadere*:', style: { color: LEAF } })
})

test('versions: the v is part of the amber token', async () => {
  expect(kinds('v0.3.1, (v0.3.1) and V2.0')).toEqual([
    ['v0.3.1', 'number'],
    ['v0.3.1', 'number'],
    ['V2.0', 'number'],
  ])
  const leaf = rowsOf('r\n└── version: v0.3.1')[1]!
  expect(labelRuns(leaf, LINEAGE)[2]).toEqual({ text: 'v0.3.1', style: { color: NUM } })
  const branch = rowsOf('r\n├── Bump to v0.3.1\n│   └── x')[1]!
  expect(labelRuns(branch, LINEAGE)[1]).toEqual({ text: 'v0.3.1', style: { color: NUM, weight: 'bold' } })
})

test('indent: children of a last ┗━━ indented 7 align with their cousins at 5', async () => {
  expect(normalizeIndent(HEAVY_TREE.split('\n')).slice(7)).toEqual([
    '┗━━ Last top branch',
    '     └── leaf',
  ])
  const deep = [
    '● T',
    '┣━━ A',
    '┃    ├── a1',
    '┃    └── a2',
    '┗━━ B',
    '       ├── b1',
    '       │    └── b1x',
    '       └── b2',
    '            └── b2x',
  ]
  expect(normalizeIndent(deep).slice(4)).toEqual([
    '┗━━ B',
    '     ├── b1',
    '     │    └── b1x',
    '     └── b2',
    '          └── b2x',
  ])
  // Lineage reads the same either way: b1x hangs from b1 at depth 3.
  const rows = rowsOf(deep.join('\n'))
  expect(rows.map(r => r.depth)).toEqual([0, 1, 2, 2, 1, 2, 3, 2, 3])
  expect(prefixOf(rows, 6)).toEqual([['│', TAN], ['└', D2], ['─', D2], ['─', D2]])
  // Already aligned, light trees, and lines with guides in the way are untouched.
  expect(normalizeIndent(DEEP_TREE.split('\n'))).toEqual(DEEP_TREE.split('\n'))
  expect(normalizeIndent(LIGHT_TREE.split('\n'))).toEqual(LIGHT_TREE.split('\n'))
  const blocked = ['┣━━ A', '┃    └── a1', '┗━━ B', '  │    └── b1']
  expect(normalizeIndent(blocked)).toEqual(blocked)
})

// ── Explicit line breaks inside a node (continuation lines) ──────────────

const BREAKS_TREE = [
  '● Payload',
  '┃',
  '┣━━ Database adapters',
  '┃    └── MongoDB through Mongoose',
  '┃        Postgres and SQLite through Drizzle, with generated migrations',
  '┃',
  '┗━━ Runs inside Next.js',
  '     ├── Payload installs into your app',
  '     │   as a route group',
  '     └── Server Components query directly',
].join('\n')

const LIGHT_BREAKS = [
  'r',
  '├── A',
  '│   one',
  '├── B',
  '│   ├── b1',
  '│   │   b1 cont',
  '│   └── b2',
  '│       b2 cont',
  '│       ├── c1',
  '│       │   c1 cont',
  '│       └── c2',
  '│           c2 cont',
  '└── Z',
  '    z cont',
].join('\n')

const shape = (rows: ReturnType<typeof rowsOf>) =>
  rows.map(({ prefix, label, role, depth, connector, first }) => ({ prefix, label, role, depth, connector, first }))

test('breaks: continuation lines under ┣━━/┗━━ children, last and non-last', async () => {
  expect(continuations(BREAKS_TREE.split('\n'))).toEqual([, , , , 3, , , , 7, ,])
  const rows = shape(rowsOf(BREAKS_TREE))
  expect(rows).toHaveLength(10)
  expect(rows[4]).toEqual({
    prefix: '┃        ',
    label: 'Postgres and SQLite through Drizzle, with generated migrations',
    role: 'leaf',
    depth: 2,
    connector: -1,
    first: false,
  })
  expect(rows[8]).toEqual({ prefix: '     │   ', label: 'as a route group', role: 'leaf', depth: 2, connector: -1, first: false })
  // Spacers stay spacers.
  expect(rows[5]).toEqual({ prefix: '┃', label: '', role: 'guide', depth: -1, connector: -1, first: true })
  // Guides keep their owners' colors: spine seed, the │ to the next sibling tan.
  const all = rowsOf(BREAKS_TREE)
  expect(prefixOf(all, 4)).toEqual([['┃', SEED]])
  expect(prefixOf(all, 8)).toEqual([['│', TAN]])
})

test('breaks: continuation under a top-level ┣━━ / ┗━━ node itself', async () => {
  const tree = ['● T', '┣━━ Alpha', '┃   second line', '┃    └── a1', '┗━━ Omega', '    omega two'].join('\n')
  const rows = shape(rowsOf(tree))
  expect(rows[2]).toEqual({ prefix: '┃   ', label: 'second line', role: 'top', depth: 1, connector: -1, first: false })
  expect(rows[5]).toEqual({ prefix: '    ', label: 'omega two', role: 'top', depth: 1, connector: -1, first: false })
  // Alpha is a branch: its second line is bold tan too; Omega has no children.
  const all = rowsOf(tree)
  expect(labelRuns(all[2]!, LINEAGE)).toEqual([{ text: 'second line', style: { color: TAN, weight: 'bold' } }])
  expect(labelRuns(all[5]!, LINEAGE)).toEqual([{ text: 'omega two', style: {} }])
})

test('breaks: depths 1–3, last and non-last, prefixes and lineage', async () => {
  const rows = rowsOf(LIGHT_BREAKS)
  const cont = (i: number) => [rows[i]!.prefix, rows[i]!.label, rows[i]!.depth, rows[i]!.first]
  expect(cont(2)).toEqual(['│   ', 'one', 1, false])
  expect(cont(5)).toEqual(['│   │   ', 'b1 cont', 2, false])
  expect(cont(7)).toEqual(['│       ', 'b2 cont', 2, false])
  expect(cont(9)).toEqual(['│       │   ', 'c1 cont', 3, false])
  expect(cont(11)).toEqual(['│           ', 'c2 cont', 3, false])
  expect(cont(13)).toEqual(['    ', 'z cont', 1, false])
  expect(prefixOf(rows, 5)).toEqual([['│', SEED], ['│', TAN]])
  expect(prefixOf(rows, 9)).toEqual([['│', SEED], ['│', D2]])
  // b2 keeps its children: its second line is bold clay, like its first.
  expect(rows[7]!.hasChildren).toBe(true)
  expect(labelRuns(rows[7]!, LINEAGE)).toEqual([{ text: 'b2 cont', style: { color: D2, weight: 'bold' } }])
})

test('breaks: classification ignores continuation lines', async () => {
  expect(classify(BREAKS_TREE.split('\n'))).toEqual([
    'root', 'guide', 'top', 'leaf', 'leaf', 'guide', 'top', 'leaf', 'leaf', 'leaf',
  ])
  // A node with only continuation lines below it is still a leaf.
  const rows = rowsOf('r\n├── x\n│   more\n│   still more\n└── y')
  expect(rows.map(r => [r.role, r.hasChildren])).toEqual([
    ['root', true], ['top', false], ['top', false], ['top', false], ['top', false],
  ])
  const deep = rowsOf('r\n├── B\n│   ├── leafy\n│   │   more\n│   └── z')
  expect(deep.map(r => [r.role, r.hasChildren])).toEqual([
    ['root', true], ['top', true], ['leaf', false], ['leaf', false], ['leaf', false],
  ])
})

test('breaks: key: green on the first line only', async () => {
  const rows = rowsOf('r\n└── note: first line\n    other: second line')
  expect(labelRuns(rows[1]!, LINEAGE)[0]).toEqual({ text: 'note:', style: { color: LEAF } })
  expect(labelRuns(rows[2]!, LINEAGE)).toEqual([{ text: 'other: second line', style: {} }])
  // Tokens still highlight on continuation lines.
  const tok = rowsOf('r\n└── a\n    see ~/x.ts')
  expect(labelRuns(tok[2]!, LINEAGE)[1]).toEqual({ text: '~/x.ts', style: { color: PATH, underline: true } })
})

test('breaks: misaligned continuation lines normalize to the label column', async () => {
  for (const line of ['│  one', '│     one', '│ │   one', '      one']) {
    const rows = rowsOf(`r\n├── A\n${line}\n└── Z`)
    expect([rows[2]!.prefix, rows[2]!.label, rows[2]!.first]).toEqual(['│   ', 'one', false])
  }
  const heavy = rowsOf('● T\n┣━━ A\n┃    └── a1\n┃         drifted\n┗━━ Z')
  expect([heavy[3]!.prefix, heavy[3]!.label]).toEqual(['┃        ', 'drifted'])
})

test('breaks: lines with no node above fall back, never crash', async () => {
  const rows = rowsOf('● T\n┃   a note under the root\n┣━━ A\n┃    └── a1')
  expect(rows[1]).toMatchObject({ prefix: '┃   ', label: 'a note under the root', role: 'leaf', first: true })
  expect(continuations(['● T', '  ┃ x', '┣━━ A'])).toEqual([, , ,])
  expect(rowsOf('● T\n  ┃ x\n┣━━ A').length).toBe(3)
  // A column-0 line ends the node above: indented text after it is not a continuation.
  expect(continuations(['r', '├── A', 'loose', '│   x'])).toEqual([, , , ,])
})

test('breaks: a long continuation line wraps under the label column', async () => {
  const rows = rowsOf(BREAKS_TREE, 30)
  const start = rows.findIndex(r => r.label.startsWith('Postgres'))
  const end = rows.findIndex((r, i) => i > start && r.role === 'guide')
  const cont = rows.slice(start, end)
  expect(cont.map(r => r.prefix)).toEqual(cont.map(() => '┃        '))
  expect(cont.map(r => r.label).join(' ')).toBe('Postgres and SQLite through Drizzle, with generated migrations')
  expect(cont.length).toBeGreaterThan(2)
  for (const r of rows) expect(Array.from(r.prefix + r.label).length).toBeLessThanOrEqual(30)
  // A wrapped non-last child's continuation keeps the │ to its next sibling.
  const narrow = rowsOf('r\n├── A\n│   one two three four five six seven eight\n└── Z', 20)
  expect(narrow.slice(2, -1).map(r => r.prefix)).toEqual(narrow.slice(2, -1).map(() => '│   '))
})

test('breaks: drawn in a mounted render', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...message(fence(BREAKS_TREE)), viewport: { columns: 120, rows: 40 } })
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeUndefined()
  const texts = await ui.findAll({ type: 'Text' })
  const lines = texts.filter(t => t.children.some(c => typeof c !== 'string')).map(t => t.text)
  expect(lines).toEqual(
    expect.arrayContaining([
      '┃        Postgres and SQLite through Drizzle, with generated migrations',
      '     │   as a route group',
    ]),
  )
  await ui.unmount()
})

test('links: absolute and ~/ paths and URLs link; relative paths need a cwd', async () => {
  expect(pathHref('/Users/me/Coding/x', '/Users/me')).toBe('file:///Users/me/Coding/x')
  expect(pathHref('~/Coding/my dir/', '/Users/me/')).toBe('file:///Users/me/Coding/my%20dir/')
  expect(pathHref('~/x', undefined)).toBeUndefined()
  expect(pathHref('./x', '/Users/me')).toBeUndefined()
  expect(pathHref('hooks/lib.ts', '/Users/me')).toBeUndefined()
  expect(pathHref('https://example.com/a', undefined)).toBe('https://example.com/a')
  expect(pathHref('hooks/lib.ts', '/Users/me', '/repo')).toBe('file:///repo/hooks/lib.ts')
  expect(pathHref('./x', undefined, '/repo/sub')).toBe('file:///repo/sub/x')
})

test('links: relative paths resolve under the cwd, . and .. included', async () => {
  expect(resolvePath('hooks/lib.ts', undefined, '/repo')).toBe('/repo/hooks/lib.ts')
  expect(resolvePath('../other/a.md', undefined, '/repo/sub/')).toBe('/repo/other/a.md')
  expect(resolvePath('./dir/', undefined, '/repo')).toBe('/repo/dir/')
  expect(resolvePath('hooks/lib.ts', '/Users/me')).toBeUndefined()
  expect(resolvePath('https://example.com/a', '/Users/me', '/repo')).toBeUndefined()
})

const LINK_TREE = [
  '● Paths',
  '┃',
  '┣━━ Source',
  '┃    └── /Users/me/Coding/claude-mods/ascii-tree',
  '┃',
  '┗━━ Files',
  '     ├── ~/.claude/commands/ascii-tree.md',
  '     └── hooks/lib.ts',
].join('\n')

test('links: paths draw as file:// links outside an IDE', async ($, on) => {
  mock.env(on, { TERM_PROGRAM: 'WezTerm', HOME: '/Users/me' })
  const ui = await $.ui.mount({ ...message(fence(LINK_TREE)), viewport: { columns: 120, rows: 40 } })
  const links = await ui.findAll({ type: 'Link' })
  expect(links.map(l => l.props.href)).toEqual([
    'file:///Users/me/Coding/claude-mods/ascii-tree',
    'file:///Users/me/.claude/commands/ascii-tree.md',
  ])
  // The link wraps the path's own styled run.
  expect(links[0]?.children).toEqual([
    {
      type: 'Text',
      props: { color: PATH, underline: true },
      children: ['/Users/me/Coding/claude-mods/ascii-tree'],
    },
  ])
  await ui.unmount()
})

test('links: none in Cursor / VS Code, whose terminal links paths itself', async ($, on) => {
  mock.env(on, { TERM_PROGRAM: 'vscode', HOME: '/Users/me' })
  const ui = await $.ui.mount({ ...message(fence(LINK_TREE)), viewport: { columns: 120, rows: 40 } })
  expect(await ui.findAll({ type: 'Link' })).toEqual([])
  expect(await ui.find({ type: 'Text', text: '/Users/me/Coding/claude-mods/ascii-tree' })).toBeDefined()
  await ui.unmount()
})

test('links: a path a wrap split across rows is not linked', async ($, on) => {
  mock.env(on, { TERM_PROGRAM: 'WezTerm', HOME: '/Users/me' })
  const ui = await $.ui.mount({ ...message(fence(LINK_TREE)), viewport: { columns: 34, rows: 40 } })
  const hrefs = (await ui.findAll({ type: 'Link' })).map(l => l.props.href)
  expect(hrefs).not.toContain(expect.stringContaining('claude-mods'))
  await ui.unmount()
})

test('palette: light themes draw in the light palette, others in the dark one', async () => {
  for (const theme of ['light', 'light-daltonized', 'light-ansi']) expect(paletteFor(theme)).toBe(LINEAGE_LIGHT)
  for (const theme of ['dark', 'dark-ansi', 'auto', undefined, 3]) expect(paletteFor(theme)).toBe(LINEAGE)
})

/** The color of the label run reading `text`, inside the row that holds it. */
const colorOf = async (ui: { find: (q: { type: string; text: string }) => Promise<unknown> }, text: string) => {
  const row = (await ui.find({ type: 'Text', text })) as {
    children: { props: { color?: string }; children: unknown[] }[]
  }
  return row.children.find(run => run.children[0] === text)?.props.color
}

/** WCAG contrast of a #RRGGBB color on white. */
const onWhite = (hex: string): number => {
  const lin = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const l = 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
  return 1.05 / (l + 0.05)
}

test('palette: every light color clears 4.5:1 on white', async () => {
  const { seed, depth, leafKey, path, number } = LINEAGE_LIGHT
  for (const style of [seed, ...depth, leafKey, path, number]) {
    expect(onWhite(style.color as string)).toBeGreaterThanOrEqual(4.5)
  }
})

const themed = (on: On, theme: string) =>
  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: theme }] }) as never)

test('theme: a light theme draws the tree in the light palette', async ($, on) => {
  themed(on, 'light')
  const ui = await $.ui.mount({ ...message(fence(HEAVY_TREE)), viewport: { columns: 120, rows: 40 } })
  expect(await colorOf(ui, '● Title')).toBe('#5C3A1A')
  expect(await colorOf(ui, 'Top branch')).toBe('#8A6224')
  await ui.unmount()
})

test('theme: a dark theme keeps the lineage palette', async ($, on) => {
  themed(on, 'dark')
  const ui = await $.ui.mount({ ...message(fence(HEAVY_TREE)), viewport: { columns: 120, rows: 40 } })
  expect(await colorOf(ui, '● Title')).toBe(SEED)
  await ui.unmount()
})

test('paths with spaces: quoted, backticked or escaped draw as one path', async () => {
  expect(tokenize('see "~/Library/Application Support/x.json" now')).toEqual([
    { text: 'see ' },
    { text: '~/Library/Application Support/x.json', kind: 'path' },
    { text: ' now' },
  ])
  expect(tokenize('`/Users/me/My Files/a.txt`')).toEqual([{ text: '/Users/me/My Files/a.txt', kind: 'path' }])
  expect(tokenize('~/My\\ Files/a.txt.')).toEqual([{ text: '~/My\\ Files/a.txt', kind: 'path' }, { text: '.' }])
  expect(tokenize('/My\\ Files/a')).toEqual([{ text: '/My\\ Files/a', kind: 'path' }])
  // Quoted prose and code that aren't whole paths stay as they were.
  expect(tokenize('"hello world"')).toEqual([{ text: '"hello world"', kind: 'quote' }])
  expect(tokenize('`npm run build`')).toEqual([{ text: 'npm run build', kind: 'code' }])
  expect(tokenize('`a/b c`')).toEqual([{ text: 'a/b c', kind: 'code' }])
  // Bare spaces still end a path: "/usr/bin vs src/x" is two tokens.
  expect(tokenize('/usr/bin vs src/x.ts')[0]).toEqual({ text: '/usr/bin', kind: 'path' })
})

test('paths with spaces: link with the space encoded', async () => {
  expect(pathHref('~/Library/Application Support/x', '/Users/me')).toBe(
    'file:///Users/me/Library/Application%20Support/x',
  )
  expect(pathHref('/My\\ Files/a', undefined)).toBe('file:///My%20Files/a')
})

/** Answers the session's directory and which absolute paths exist. */
const files = (on: On, cwd: string, existing: readonly string[]) => {
  on('session.cwd', () => ({ value: cwd }))
  on('fs.exists', ($, e) => ({ value: existing.includes(e.path) }))
}

test('links: a relative path that exists under the cwd links', async ($, on) => {
  mock.env(on, { TERM_PROGRAM: 'WezTerm', HOME: '/Users/me' })
  files(on, '/Users/me/Coding/claude-mods/ascii-tree', ['/Users/me/Coding/claude-mods/ascii-tree/hooks/lib.ts'])
  const ui = await $.ui.mount({ ...message(fence(LINK_TREE)), viewport: { columns: 120, rows: 40 } })
  expect((await ui.findAll({ type: 'Link' })).map(l => l.props.href)).toContain(
    'file:///Users/me/Coding/claude-mods/ascii-tree/hooks/lib.ts',
  )
  await ui.unmount()
})

test('links: a relative path missing under the cwd stays plain', async ($, on) => {
  mock.env(on, { TERM_PROGRAM: 'WezTerm', HOME: '/Users/me' })
  files(on, '/elsewhere', [])
  const ui = await $.ui.mount({ ...message(fence(LINK_TREE)), viewport: { columns: 120, rows: 40 } })
  const hrefs = (await ui.findAll({ type: 'Link' })).map(l => l.props.href)
  expect(hrefs).not.toContain(expect.stringContaining('hooks/lib.ts'))
  expect(hrefs).toHaveLength(2)
  await ui.unmount()
})

test('links: a path that cannot link is drawn without its underline', async ($, on) => {
  mock.env(on, { TERM_PROGRAM: 'WezTerm', HOME: '/Users/me' })
  files(on, '/elsewhere', [])
  const ui = await $.ui.mount({ ...message(fence(LINK_TREE)), viewport: { columns: 120, rows: 40 } })
  const row = (await ui.find({ type: 'Text', text: 'hooks/lib.ts' })) as {
    children: { props: { underline?: boolean }; children: unknown[] }[]
  }
  expect(row.children.find(run => run.children[0] === 'hooks/lib.ts')?.props).toEqual({ color: PATH })
  await ui.unmount()
})

test('links: in an IDE terminal paths keep their underline, as it links them', async ($, on) => {
  mock.env(on, { TERM_PROGRAM: 'vscode', HOME: '/Users/me' })
  const ui = await $.ui.mount({ ...message(fence(LINK_TREE)), viewport: { columns: 120, rows: 40 } })
  const row = (await ui.find({ type: 'Text', text: 'hooks/lib.ts' })) as {
    children: { props: { underline?: boolean }; children: unknown[] }[]
  }
  expect(row.children.find(run => run.children[0] === 'hooks/lib.ts')?.props.underline).toBe(true)
  await ui.unmount()
})

/** Three backticks, spelled out so this file's own strings stay plain. */
const TICKS = '`'.repeat(3)

test('fences: three backticks mid-line stay inside the tree', async () => {
  const tree = ['● Title', '┃', '┣━━ inside a ' + TICKS + ' block', '┃    └── leaf', '┃', '┗━━ last'].join('\n')
  const parts = splitParts('intro\n' + fence(tree) + '\noutro')
  expect(parts.map(p => p.kind)).toEqual(['prose', 'tree', 'prose'])
  expect(parts[1]?.text).toBe(tree)
  expect(parts[2]?.text.trim()).toBe('outro')
})

test('fences: a closing fence must open its own line', async () => {
  const parts = splitParts([TICKS, '├── a ' + TICKS + ' b', '└── c', '  ' + TICKS + '  ', 'after'].join('\n'))
  expect(parts[0]).toEqual({ kind: 'tree', text: '├── a ' + TICKS + ' b\n└── c' })
})
