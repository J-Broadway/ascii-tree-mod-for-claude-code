// Pure helpers shared by the hooks module and the tests.

/**
 * A ``` fenced block, as CommonMark reads one: both fences open their own
 * line (up to 3 spaces in), so ``` in the middle of a line is text.
 */
const FENCE = /^ {0,3}```([^\n`]*)\n([\s\S]*?)^ {0,3}```[ \t]*$/gm

/** A branch glyph followed by its rule: ├── └── ├─ └─ ╰─ ┣━━ ┗━━. */
const BRANCH = /[├└┣┗╰][─━]/
/** A branch line: guides, a branch, then a label that is not more drawing. */
const BRANCH_LINE = /^[\s│┃]*[├└┣┗╰][─━]+\s*[^\s─━│┃├└┣┗╰]/
/** Box and table corners and joints: a block holding any is not a tree. */
const BOX = /[┌┐┘┤┴┼╋┳┻┫┏┓┛═║╔╗╚╝]/
/** A horizontal rule: a section divider (═══ ━━━ ───), maybe under guides. */
const RULE = /^[\s│┃]*[═━─]{3,}\s*$/

/** True for a line that is only a horizontal rule. */
export const isRule = (line: string): boolean => RULE.test(line)

/**
 * True when a block of text reads as an ASCII tree: at least one branch line
 * (light ├── / └── or heavy ┣━━ / ┗━━ with a label after it) and no box or
 * table drawing. Rule lines are dividers, not boxes: a ═══ line between
 * sections is left out of the box test (a real box keeps its corners and
 * sides, which still match).
 */
export const isTree = (block: string): boolean => {
  const lines = block.split('\n').filter(line => !isRule(line))
  if (BOX.test(lines.join('\n'))) return false
  return lines.some(line => BRANCH_LINE.test(line))
}

/**
 * Code a tree was interrupted by: `lines` are drawn under the tree line at
 * index `after` (the node the code belongs to), in the order they were written.
 */
export type CodeInsert = { after: number; lines: string[] }

/**
 * Splits markdown into prose and tree-fence parts, in order, so a drawing can
 * keep the prose as markdown and lay the trees out itself. A tree that a code
 * block interrupts (see `stitch`) is one `tree` part: `text` is the tree as if
 * the code weren't there, `code` the interruptions, so it lays out exactly as
 * the uninterrupted tree would.
 */
export type Part = { kind: 'prose' | 'tree'; text: string; code?: CodeInsert[] }

type Fence = { at: number; end: number; info: string; body: string }

/** The ``` fences of a message, each with where it sits and its body without the last newline. */
const fencesOf = (text: string): Fence[] =>
  [...text.matchAll(FENCE)].map(match => {
    const at = match.index ?? 0
    return { at, end: at + match[0].length, info: match[1] ?? '', body: (match[2] ?? '').replace(/\n$/, '') }
  })

/** A continuation fence picks a tree up after a code block: no root line, it opens on a guide or branch glyph. */
const CONTINUES = /^\s*[│┃├└┣┗╰]/
const continues = (body: string): boolean =>
  CONTINUES.test(body.split('\n').find(line => line.trim() !== '') ?? '')

/** A fence's lines with the blank ones at either end dropped. */
const trimmed = (body: string): string[] => {
  const lines = body.split('\n')
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop()
  while (lines.length > 0 && (lines[0] ?? '').trim() === '') lines.shift()
  return lines
}

/**
 * The tree that starts at fence `from` with the code blocks that interrupt it:
 * a tree fence, then one or more non-tree fences, then a continuation fence,
 * repeated as often as it goes. Only whitespace may sit between the fences, so
 * prose in between ends the tree (and a code block with no continuation after
 * it is not part of it). `next` is the index of the first fence left over.
 */
const stitch = (text: string, fences: readonly Fence[], from: number): { part: Part; end: number; next: number } => {
  const first = fences[from] as Fence
  const lines = trimmed(first.body)
  const code: CodeInsert[] = []
  let end = first.end
  let next = from + 1
  for (;;) {
    // The code fences right after the tree so far, whitespace apart.
    let j = next
    let prevEnd = end
    const run: Fence[] = []
    for (let f = fences[j]; f !== undefined && !isTree(f.body) && text.slice(prevEnd, f.at).trim() === ''; f = fences[++j]) {
      run.push(f)
      prevEnd = f.end
    }
    const tail = fences[j]
    if (run.length === 0 || tail === undefined || !isTree(tail.body) || !continues(tail.body)) break
    if (text.slice(prevEnd, tail.at).trim() !== '') break
    // The node is the last line of the tree so far; the continuation joins on below it.
    for (const f of run) code.push({ after: lines.length - 1, lines: f.body.split('\n') })
    lines.push(...trimmed(tail.body))
    end = tail.end
    next = j + 1
  }
  const part: Part = { kind: 'tree', text: lines.join('\n') }
  return { part: code.length > 0 ? { ...part, code } : part, end, next }
}

export const splitParts = (text: string): Part[] => {
  const parts: Part[] = []
  const fences = fencesOf(text)
  let last = 0
  for (let i = 0; i < fences.length; ) {
    const fence = fences[i] as Fence
    if (!isTree(fence.body)) {
      i++
      continue
    }
    const before = text.slice(last, fence.at)
    if (before.trim() !== '') parts.push({ kind: 'prose', text: before })
    const { part, end, next } = stitch(text, fences, i)
    parts.push(part)
    last = end
    i = next
  }
  const rest = text.slice(last)
  if (rest.trim() !== '') parts.push({ kind: 'prose', text: rest })
  return parts
}

/**
 * Prose split around its code fences, so a block of code can be drawn as one:
 * `text` is the code without its fences, `lang` the fence's language tag.
 */
export type Piece = { kind: 'prose'; text: string } | { kind: 'code'; text: string; lang: string | undefined }
export const splitCode = (prose: string): Piece[] => {
  const pieces: Piece[] = []
  let last = 0
  for (const f of fencesOf(prose)) {
    const before = prose.slice(last, f.at)
    if (before.trim() !== '') pieces.push({ kind: 'prose', text: before })
    pieces.push({ kind: 'code', text: f.body, lang: f.info.trim().split(/\s+/)[0] || undefined })
    last = f.end
  }
  const rest = prose.slice(last)
  if (rest.trim() !== '') pieces.push({ kind: 'prose', text: rest })
  return pieces
}

/** Columns a line takes, counting each code point as one cell. */
export const width = (line: string): number => Array.from(line).length

/** The `cols` cells of `line` from column `offset` (code points, not UTF-16). */
export const sliceCols = (line: string, offset: number, cols?: number): string => {
  const chars = Array.from(line)
  return chars.slice(offset, cols === undefined ? undefined : offset + cols).join('')
}

/** The drawing a line opens with: guides, branches and the space after them. */
const GUIDE = /^[\s│┃├└┣┗╰─━┬╭]*/

/** The guide as a continuation row draws it: branches become plain stems. */
export const stemOf = (guide: string): string =>
  guide
    .replace(/├/g, '│')
    .replace(/┣/g, '┃')
    .replace(/[└┗╰─━┬╭]/g, ' ')

/**
 * Wraps one tree line to `cols`, keeping the tree's guides: continuation rows
 * repeat the line's guide with its branch (├── / ┣━━) turned into a plain
 * stem (│ / ┃) and a last branch (└── / ┗━━) into spaces, so wrapped text
 * stays under its own label and the vertical guides run on unbroken.
 */
export const wrapTreeLine = (line: string, cols: number): string[] => {
  if (width(line) <= cols) return [line]
  const guide = line.match(GUIDE)?.[0] ?? ''
  const stem = stemOf(guide)
  const room = cols - width(guide)
  // A guide too deep to leave room for text: hard-wrap the whole line.
  if (room < 12) {
    const rows: string[] = []
    for (let at = 0; at < width(line); at += cols) rows.push(sliceCols(line, at, cols))
    return rows
  }
  const rows: string[] = []
  let row = ''
  const push = () => {
    rows.push((rows.length === 0 ? guide : stem) + row)
    row = ''
  }
  for (const word of line.slice(guide.length).split(/(?<= )/)) {
    let rest = word
    // Move to a new row when the word doesn't fit; split words wider than a row.
    while (width(row) + width(rest) > room) {
      if (row !== '' && width(rest) <= room) {
        push()
        break
      }
      const fit = room - width(row)
      row += sliceCols(rest, 0, fit)
      rest = sliceCols(rest, fit)
      push()
    }
    row += rest
  }
  if (row !== '' || rows.length === 0) push()
  return rows.map(r => r.replace(/\s+$/, ''))
}

/** The widest line's width. */
export const maxWidth = (lines: readonly string[]): number =>
  lines.reduce((max, line) => Math.max(max, width(line)), 0)

/**
 * What a tree line is, for styling:
 * - `root`: a line with no guide before it (`● Title`, or an old tree's root)
 * - `top`: a top-level branch's label (the shallowest branch column)
 * - `branch`: a deeper branch that has children
 * - `leaf`: a branch without children, or a note under the root
 * A node's continuation lines (hard line breaks) take the node's role.
 * - `guide`: a line of guides alone (`┃`, `│`, blank)
 * - `rule`: a horizontal rule (═══ ━━━ ───), a section divider
 * - `code`: a row of a code block drawn inside the tree (`layoutTree` makes
 *   these; `classify` never returns one)
 */
export type Role = 'root' | 'top' | 'branch' | 'leaf' | 'guide' | 'rule' | 'code'

/** Where each line's own branch glyph sits, or -1 for a line without one. */
const branchCols = (lines: readonly string[]): number[] =>
  lines.map(line => {
    const guide = Array.from(line.match(GUIDE)?.[0] ?? '')
    if (!BRANCH_LINE.test(line)) return -1
    return guide.findIndex((ch, i) => /[├└┣┗╰]/.test(ch) && /[─━]/.test(guide[i + 1] ?? ''))
  })

/** A guide made of verticals and spaces alone: no connector in it. */
const STEM_ONLY = /^[\s│┃]+$/

/**
 * For each line, the index of the node line it continues, or undefined.
 * A continuation is a hard line break inside a node: a line whose prefix is
 * only verticals (│ ┃) and spaces, followed by text, with no connector of its
 * own. It belongs to the nearest node (branch line) above it. A line like
 * that with no node above (right under the root, or after a root-like line
 * at column 0) is not a continuation and keeps the old reading.
 */
export const continuations = (lines: readonly string[]): (number | undefined)[] => {
  const cols = branchCols(lines)
  let node: number | undefined
  return lines.map((line, i) => {
    if ((cols[i] ?? -1) >= 0) {
      node = i
      return undefined
    }
    if (isRule(line)) {
      // A divider ends the node above, as a root-like line does.
      node = undefined
      return undefined
    }
    const guide = line.match(GUIDE)?.[0] ?? ''
    const label = line.slice(guide.length)
    if (label.trim() === '') return undefined
    if (guide === '') {
      // Text at column 0 (a root-like line) ends the node above.
      node = undefined
      return undefined
    }
    return STEM_ONLY.test(guide) ? node : undefined
  })
}

/**
 * Classifies each line of a tree block, structurally: a branch's depth is the
 * column its branch glyph sits at, and it has children when the next branch
 * line below sits deeper. Undefined when the block holds no branch at all.
 */
export const classify = (lines: readonly string[]): Role[] | undefined => {
  const cols = branchCols(lines)
  const found = cols.filter(c => c >= 0)
  if (found.length === 0) return undefined
  const top = Math.min(...found)
  const owner = continuations(lines)
  const roles = lines.map((line, i): Role => {
    if (isRule(line)) return 'rule'
    const guide = line.match(GUIDE)?.[0] ?? ''
    const label = line.slice(guide.length)
    if (label.trim() === '') return 'guide'
    const col = cols[i] ?? -1
    if (col < 0) return guide === '' ? 'root' : 'leaf'
    if (col === top) return 'top'
    const next = cols.slice(i + 1).find(c => c >= 0)
    return next !== undefined && next > col ? 'branch' : 'leaf'
  })
  // A continuation line reads as part of its node: the node's role.
  return roles.map((role, i) => {
    const node = owner[i]
    return node === undefined ? role : (roles[node] ?? role)
  })
}

/**
 * A line's lineage: its own branch column (-1 if none), its node's depth
 * (0 for the root, 1 for top level; -1 for a guide or note line), whether
 * it has children, and for
 * each column of its guide the depth of the node that owns the guide drawn
 * there, the parent whose children hang from that column.
 */
export type Lineage = {
  col: number
  depth: number
  owners: readonly (number | undefined)[]
  /** True for a branch line whose next branch line below sits deeper. */
  hasChildren: boolean
}

/**
 * Walks the tree keeping a stack of open branches: a branch at column c is a
 * child of the nearest branch above it at a shallower column (or the root),
 * and from then on column c belongs to that parent until a sibling or a
 * shallower branch closes it.
 */
export const lineage = (lines: readonly string[], roles: readonly Role[]): Lineage[] => {
  const cols = branchCols(lines)
  const stack: { col: number; depth: number }[] = []
  let owners: (number | undefined)[] = []
  return lines.map((_, i) => {
    const col = cols[i] ?? -1
    const role = roles[i]
    if (col < 0) {
      return { col, depth: role === 'root' ? 0 : -1, owners: owners.slice(), hasChildren: role === 'root' }
    }
    while (stack.length > 0 && (stack[stack.length - 1]?.col ?? -1) >= col) stack.pop()
    const parent = stack[stack.length - 1]?.depth ?? 0
    owners = owners.slice(0, col)
    owners[col] = parent
    stack.push({ col, depth: parent + 1 })
    const next = cols.slice(i + 1).find(c => c >= 0)
    return { col, depth: parent + 1, owners: owners.slice(), hasChildren: next !== undefined && next > col }
  })
}

/**
 * Aligns over-indented children under a last branch (└── ┗━━ ╰─). Trees
 * sometimes hang the children of a last branch 2 columns further right than
 * their cousins (`┗━━ X` then 7 spaces) since no vertical guide marks the
 * column. The tree's usual step, the most common distance from a non-last
 * branch to its first child, is the structural one; a last branch whose
 * children sit further than that has the extra columns, right after its own
 * column, taken out of every line of its subtree, but only where all those
 * cells are spaces. Anything else is left as it is.
 */
export const normalizeIndent = (input: readonly string[]): string[] => {
  const lines = input.map(line => Array.from(line))
  const glyphAt = (i: number, col: number) => lines[i]?.[col] ?? ''
  const childCol = (cols: number[], i: number): number | undefined => {
    const next = cols.slice(i + 1).find(c => c >= 0)
    return next !== undefined && next > (cols[i] ?? -1) ? next : undefined
  }
  const steps = new Map<number, number>()
  {
    const cols = branchCols(input)
    cols.forEach((col, i) => {
      if (col < 0 || /[└┗╰]/.test(glyphAt(i, col))) return
      const child = childCol(cols, i)
      if (child !== undefined) steps.set(child - col, (steps.get(child - col) ?? 0) + 1)
    })
  }
  const step = [...steps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (step === undefined) return input.slice()
  // Each pass fixes one subtree; columns are read afresh after each.
  for (let pass = 0; pass < lines.length; pass++) {
    const cols = branchCols(lines.map(l => l.join('')))
    let fixed = false
    for (let i = 0; i < lines.length && !fixed; i++) {
      const col = cols[i] ?? -1
      if (col < 0 || !/[└┗╰]/.test(glyphAt(i, col))) continue
      const child = childCol(cols, i)
      if (child === undefined) continue
      const extra = child - col - step
      if (extra <= 0 || extra > 4) continue
      let end = i + 1
      while (end < lines.length && !((cols[end] ?? -1) >= 0 && (cols[end] ?? -1) <= col)) end++
      const cells = (j: number) => lines[j]?.slice(col + 1, col + 1 + extra) ?? []
      const subtree = Array.from({ length: end - i - 1 }, (_, k) => i + 1 + k)
      const movable = subtree.filter(j => cells(j).length === extra && cells(j).every(c => c === ' '))
      // Every branch line in the subtree must move, or the shape would break.
      if (subtree.some(j => (cols[j] ?? -1) >= 0 && !movable.includes(j))) continue
      for (const j of movable) lines[j]?.splice(col + 1, extra)
      fixed = movable.length > 0
    }
    if (!fixed) break
  }
  return lines.map(l => l.join(''))
}

/**
 * One drawn row of a tree: its guide part, its label part, its role, and its
 * lineage (a node is a leaf when it is on a branch line without children). `connector` is the column of the row's own branch glyph (on the
 * first row of a branch line only, else -1); `first` is false on rows a long
 * line wrapped onto and on a node's continuation lines (hard line breaks).
 */
export type Row = {
  prefix: string
  label: string
  role: Role
  depth: number
  owners: readonly (number | undefined)[]
  hasChildren: boolean
  connector: number
  first: boolean
  /** The node line's whole label before wrapping, so a token split across rows can be told from a whole one. */
  whole: string
  /**
   * Where this row's label starts in `whole`, so a token can be found on the
   * whole label and drawn cut at the row breaks. Undefined when the label
   * can't be placed in it.
   */
  offset: number | undefined
  /** On a node's hard-break continuation lines: their text is never a `key:`. */
  continuation: boolean
}

/** Where each row's label starts in `whole`: the rows are its consecutive slices, less the spaces a wrap broke at. */
const offsets = (labels: readonly string[], whole: string): (number | undefined)[] => {
  let cursor = 0
  return labels.map(label => {
    const at = whole.indexOf(label, cursor)
    if (at < 0) return undefined
    cursor = at + label.length
    return at
  })
}

/** Tabs count as this many columns in code, so a row's width is what it is drawn at. */
const TAB = '    '

/**
 * The rows of a code block that hangs under the node at `lines[node]`: the
 * node's stem for a prefix (so every vertical running past the code runs on
 * unbroken, the node's own included when later siblings follow) and the code
 * at the node's label column, like a hard-break continuation line. No
 * vertical goes at the child column: the code text sits there, and nothing
 * draws a child column before the first child's own connector. A line wider
 * than the room is cut into rows of it under the same prefix, indentation
 * kept on every row; a blank line keeps its row. Never tokenized: `offset` is undefined
 * and the row's `role` is `code`.
 */
const codeRows = (code: readonly string[], nodeLine: string | undefined, nodeLineage: Lineage | undefined, cols: number): Row[] => {
  const prefix = stemOf(nodeLine?.match(GUIDE)?.[0] ?? '')
  const room = Math.max(cols - width(prefix), 4)
  return code.flatMap(raw => {
    const text = raw.replace(/\t/g, TAB).replace(/\s+$/, '')
    // A wrapped line hangs at its own indentation, so the rows read as one statement.
    const indent = Math.min(text.length - text.trimStart().length, Math.max(room - 4, 0))
    const step = room - indent
    const pieces =
      text === ''
        ? ['']
        : [sliceCols(text, 0, room), ...Array.from({ length: Math.max(Math.ceil((width(text) - room) / step), 0) }, (_, n) => ' '.repeat(indent) + sliceCols(text, room + n * step, step))]
    return pieces.map((label, n): Row => ({
      role: 'code',
      depth: nodeLineage?.depth ?? -1,
      owners: nodeLineage?.owners ?? [],
      hasChildren: false,
      prefix,
      label,
      connector: -1,
      first: n === 0,
      whole: text,
      offset: undefined,
      continuation: true,
    }))
  })
}

/**
 * Lays a tree block out in rows no wider than `cols`, each split into the
 * guide drawing and the label so the two can be styled apart. Undefined when
 * the block does not parse as a tree. `code` blocks hang under the tree line
 * they follow (see `codeRows`), laid out with the rest so the verticals stay
 * unbroken; the tree itself is laid out as if they weren't there.
 */
export const layoutTree = (block: string, cols: number, code: readonly CodeInsert[] = []): Row[] | undefined => {
  const lines = normalizeIndent(block.split('\n'))
  const roles = classify(lines)
  if (roles === undefined) return undefined
  const known: readonly Role[] = roles
  const lineages = lineage(lines, known)
  const owner = continuations(lines)
  const branchAt = branchCols(lines)
  // The node a code block belongs to: the tree line it follows, its owner for
  // a continuation line, else the nearest branch line above.
  const nodeOf = (at: number): number | undefined => {
    if ((branchAt[at] ?? -1) >= 0) return at
    const owned = owner[at]
    if (owned !== undefined) return owned
    for (let k = at - 1; k >= 0; k--) if ((branchAt[k] ?? -1) >= 0) return k
    return undefined
  }
  const withCode = (rows: Row[], i: number): Row[] =>
    code.filter(c => c.after === i).reduce((out, c) => {
      const at = nodeOf(i)
      return [...out, ...codeRows(c.lines, at === undefined ? undefined : lines[at], at === undefined ? undefined : lineages[at], cols)]
    }, rows)
  return lines.flatMap((line, i): Row[] => withCode(rowsOf(line, i), i))

  function rowsOf(line: string, i: number): Row[] {
    const node = owner[i]
    const nodeLine = node === undefined ? undefined : lines[node]
    if (node !== undefined && nodeLine !== undefined) {
      // A hard line break inside a node: drawn like a wrapped row of it, its
      // text at the node's label column (whatever column it was written at),
      // under the node's stem, in the node's lineage; it wraps on its own.
      const nodeLineage = lineages[node]
      const stem = stemOf(nodeLine.match(GUIDE)?.[0] ?? '')
      const text = line.slice((line.match(GUIDE)?.[0] ?? '').length).replace(/\s+$/, '')
      const wrapped = wrapTreeLine(stem + text, cols).map(row => {
        const prefix = row.match(GUIDE)?.[0] ?? ''
        return { prefix, label: row.slice(prefix.length) }
      })
      const at = offsets(wrapped.map(r => r.label), text)
      return wrapped.map(({ prefix, label }, n) => {
        return {
          role: known[node] ?? 'leaf',
          depth: nodeLineage?.depth ?? -1,
          owners: nodeLineage?.owners ?? [],
          hasChildren: nodeLineage?.hasChildren ?? false,
          prefix,
          label,
          connector: -1,
          first: false,
          whole: text,
          offset: at[n],
          continuation: true,
        }
      })
    }
    const role = known[i] ?? 'leaf'
    const { col, depth, owners, hasChildren } = lineages[i] ?? {
      col: -1,
      depth: -1,
      owners: [],
      hasChildren: false,
    }
    const base = { role, depth, owners, hasChildren, continuation: false }
    const trimmed = line.replace(/\s+$/, '')
    const whole = trimmed.slice((trimmed.match(GUIDE)?.[0] ?? '').length)
    if (role === 'rule') {
      // Never wrapped: a divider too wide for the screen is cut at its edge.
      const prefix = trimmed.match(/^[\s│┃]*/)?.[0] ?? ''
      return [{ ...base, prefix, label: trimmed.slice(prefix.length), connector: -1, first: true, whole, offset: 0 }]
    }
    if (role === 'guide') return [{ ...base, prefix: trimmed, label: '', connector: -1, first: true, whole, offset: 0 }]
    if (role === 'root') {
      const labels = wrapTreeLine(trimmed, cols)
      const at = offsets(labels, whole)
      return labels.map((label, n) => ({
        ...base,
        prefix: '',
        label,
        connector: -1,
        first: n === 0,
        whole,
        offset: at[n],
      }))
    }
    const wrapped = wrapTreeLine(trimmed, cols).map(row => {
      const prefix = row.match(GUIDE)?.[0] ?? ''
      return { prefix, label: row.slice(prefix.length) }
    })
    const at = offsets(wrapped.map(r => r.label), whole)
    return wrapped.map(({ prefix, label }, n) => ({
      ...base,
      prefix,
      label,
      connector: n === 0 ? col : -1,
      first: n === 0,
      whole,
      offset: at[n],
    }))
  }
}
