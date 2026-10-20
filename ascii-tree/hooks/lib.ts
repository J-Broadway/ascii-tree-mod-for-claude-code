// Pure helpers shared by the hooks module and the tests.

const FENCE = /```[^\n]*\n([\s\S]*?)```/g

/** A branch glyph followed by its rule: ├── └── ├─ └─ ╰─ ┣━━ ┗━━. */
const BRANCH = /[├└┣┗╰][─━]/
/** A branch line: guides, a branch, then a label that is not more drawing. */
const BRANCH_LINE = /^[\s│┃]*[├└┣┗╰][─━]+\s*[^\s─━│┃├└┣┗╰]/
/** Box and table corners and joints: a block holding any is not a tree. */
const BOX = /[┌┐┘┤┴┼╋┳┻┫┏┓┛═║╔╗╚╝]/

/**
 * True when a block of text reads as an ASCII tree: at least one branch line
 * (light ├── / └── or heavy ┣━━ / ┗━━ with a label after it) and no box or
 * table drawing.
 */
export const isTree = (block: string): boolean => {
  if (BOX.test(block)) return false
  return block.split('\n').some(line => BRANCH_LINE.test(line))
}

/**
 * Splits markdown into prose and tree-fence parts, in order, so a drawing can
 * keep the prose as markdown and lay the trees out itself.
 */
export type Part = { kind: 'prose' | 'tree'; text: string }
export const splitParts = (text: string): Part[] => {
  const parts: Part[] = []
  let last = 0
  for (const match of text.matchAll(FENCE)) {
    const body = (match[1] ?? '').replace(/\n$/, '')
    if (!isTree(body)) continue
    const at = match.index ?? 0
    const before = text.slice(last, at)
    if (before.trim() !== '') parts.push({ kind: 'prose', text: before })
    parts.push({ kind: 'tree', text: body })
    last = at + match[0].length
  }
  const rest = text.slice(last)
  if (rest.trim() !== '') parts.push({ kind: 'prose', text: rest })
  return parts
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
 */
export type Role = 'root' | 'top' | 'branch' | 'leaf' | 'guide'

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
}

/**
 * Lays a tree block out in rows no wider than `cols`, each split into the
 * guide drawing and the label so the two can be styled apart. Undefined when
 * the block does not parse as a tree.
 */
export const layoutTree = (block: string, cols: number): Row[] | undefined => {
  const lines = normalizeIndent(block.split('\n'))
  const roles = classify(lines)
  if (roles === undefined) return undefined
  const lineages = lineage(lines, roles)
  const owner = continuations(lines)
  return lines.flatMap((line, i): Row[] => {
    const node = owner[i]
    const nodeLine = node === undefined ? undefined : lines[node]
    if (node !== undefined && nodeLine !== undefined) {
      // A hard line break inside a node: drawn like a wrapped row of it, its
      // text at the node's label column (whatever column it was written at),
      // under the node's stem, in the node's lineage; it wraps on its own.
      const nodeLineage = lineages[node]
      const stem = stemOf(nodeLine.match(GUIDE)?.[0] ?? '')
      const text = line.slice((line.match(GUIDE)?.[0] ?? '').length).replace(/\s+$/, '')
      return wrapTreeLine(stem + text, cols).map(row => {
        const prefix = row.match(GUIDE)?.[0] ?? ''
        return {
          role: roles[node] ?? 'leaf',
          depth: nodeLineage?.depth ?? -1,
          owners: nodeLineage?.owners ?? [],
          hasChildren: nodeLineage?.hasChildren ?? false,
          prefix,
          label: row.slice(prefix.length),
          connector: -1,
          first: false,
          whole: text,
        }
      })
    }
    const role = roles[i] ?? 'leaf'
    const { col, depth, owners, hasChildren } = lineages[i] ?? {
      col: -1,
      depth: -1,
      owners: [],
      hasChildren: false,
    }
    const base = { role, depth, owners, hasChildren }
    const trimmed = line.replace(/\s+$/, '')
    const whole = trimmed.slice((trimmed.match(GUIDE)?.[0] ?? '').length)
    if (role === 'guide') return [{ ...base, prefix: trimmed, label: '', connector: -1, first: true, whole }]
    if (role === 'root') {
      return wrapTreeLine(trimmed, cols).map((label, n) => ({
        ...base,
        prefix: '',
        label,
        connector: -1,
        first: n === 0,
        whole,
      }))
    }
    return wrapTreeLine(trimmed, cols).map((row, n) => {
      const prefix = row.match(GUIDE)?.[0] ?? ''
      return {
        ...base,
        prefix,
        label: row.slice(prefix.length),
        connector: n === 0 ? col : -1,
        first: n === 0,
        whole,
      }
    })
  })
}
