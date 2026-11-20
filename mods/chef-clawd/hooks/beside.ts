// Chef Clawd beside the other mods' rows in the band above the prompt.
//
// The band stacks one row per mod. When he shares it with others, they keep the
// left of the band and he is lifted into the right quarter they leave free,
// bottom-aligned with them, instead of drawn under them. If any of their rows
// cannot shrink that far (a word, a button, a fixed width would run into his
// quarter), he is left out of the band while it shows, and they draw as they
// would without him.
//
// Around the engine's rows a Box may carry no fixed size, clipping or position
// (width, minWidth, overflow, top...) and there is no flexBasis, so the rows
// stay stacked as the band stacks them: padding narrows the others, a left
// margin starts his Box at his quarter, and a negative top margin raises him
// beside them. The left margin matters for clicks: a click goes to the box
// drawn last under the pointer, and a Box of his that reached across the band
// took every click on the rows beside him.

import { WORK_COLUMNS, HEIGHT } from './terminal/chef'

// His widest drawing (the working scene) and a cell to spare: his share of the
// band never goes under that, so he is never clipped.
export const CHEF_MIN = WORK_COLUMNS + 1
export const CHEF_SHARE = 0.25
// Terminal rows he stands in: pixels two to a cell.
export const CHEF_ROWS = HEIGHT / 2

export type Placement = {
  /** His quarter of the band, in cells: the others' right padding. */
  width: number
  /** What the others keep: his Box's left margin. */
  room: number
  /** How far he rises beside them: never above the top of their rows. */
  lift: number
}

/**
 * Where he goes beside the others' rows, or undefined when one of them cannot
 * get narrow enough and he should step out of the band.
 */
export function place(others: readonly unknown[], bodyColumns: number): Placement | undefined {
  const width = Math.max(CHEF_MIN, Math.round(bodyColumns * CHEF_SHARE))
  const room = bodyColumns - width
  if (!others.every((t) => minWidth(t) <= room)) return undefined
  // Rows stack, so their heights add. A short band (a folded list, a one-line
  // row) lifts him only that far, so he never pokes above it; the band just
  // grows under them by the rows he has left.
  const tall = others.reduce((s: number, t) => s + minHeight(t), 0)
  return { width, room, lift: Math.min(CHEF_ROWS, tall) }
}

type Node = unknown
type El = { type?: unknown; props?: Record<string, unknown>; children?: unknown }

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0)
const signed = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

const textOf = (n: Node): string => {
  if (n === null || n === undefined || n === false || n === true) return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(textOf).join('')
  if (typeof n === 'object') return textOf((n as El).children)
  return ''
}

// Text wraps between words, so it is no narrower than its longest one; text that
// is only spaces has no break in it and keeps its full width.
const longestWord = (s: string): number =>
  s.trim() === '' ? s.length : s.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0)

const flat = (children: unknown): Node[] => {
  if (children === undefined || children === null || children === false || children === true) return []
  if (Array.isArray(children)) return children.flatMap(flat)
  return [children]
}

const isRow = (p: Record<string, unknown>) => (p.flexDirection ?? 'row') === 'row' || p.flexDirection === 'row-reverse'

/**
 * How narrow a drawn tree can get before it breaks: a Text cut at its end
 * (`wrap="truncate…"`) can shrink to one cell, a wrapping Text no narrower than
 * its longest word, a Button or fixed-width Box not at all. Ink lays a Box out
 * in a row unless it says column. An element this cannot read (an unknown type
 * with nothing inside) counts as too wide, so he steps aside rather than guess.
 * An engine node counts as nothing: inside a mod's row it is what that mod's
 * `next(e)` handed back.
 */
export function minWidth(n: Node): number {
  if (n === null || n === undefined || n === false || n === true) return 0
  if (typeof n === 'string' || typeof n === 'number') return longestWord(String(n))
  if (Array.isArray(n)) return n.reduce((m: number, c) => Math.max(m, minWidth(c)), 0)
  if (typeof n !== 'object') return Infinity
  const el = n as El
  const p = el.props ?? {}
  const kids = flat(el.children ?? p.children)
  switch (el.type) {
    case 'Text': {
      const wrap = typeof p.wrap === 'string' ? p.wrap : 'wrap'
      if (wrap.startsWith('truncate')) return 1
      // `end`/`middle` and the like keep words whole on one line: as wrapping.
      return longestWord(textOf(kids))
    }
    case 'Button':
    case 'Link':
      return typeof p.label === 'string' ? p.label.length : longestWord(textOf(kids))
    case 'Raster':
      return num(p.columns)
    case 'engine':
      return 0
    case 'Box':
    case 'Progress':
    case undefined: {
      if (typeof p.width === 'number') return p.width
      const pad =
        num(p.padding) * 2 + num(p.paddingX) * 2 + num(p.paddingLeft) + num(p.paddingRight) +
        num(p.marginX) * 2 + num(p.marginLeft) + num(p.marginRight) + (p.borderStyle ? 2 : 0)
      const widths = kids.map(minWidth)
      const gap = num(p.columnGap ?? p.gap)
      const inner =
        isRow(p) && p.flexWrap !== 'wrap'
          ? widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, kids.length - 1)
          : widths.reduce((m, w) => Math.max(m, w), 0)
      return inner + pad
    }
    default:
      // Some other element: a fixed width, else what it holds, else unknown.
      if (typeof p.width === 'number') return p.width
      return kids.length ? kids.reduce((m: number, c) => Math.max(m, minWidth(c)), 0) : Infinity
  }
}

/**
 * The fewest terminal rows a drawn tree takes: a Text one line per line break
 * (more where it wraps, which this does not count), a Button one, a Box its
 * children stacked or side by side plus its padding and border. An element
 * this cannot read counts as none. Every guess errs short, so he is never
 * lifted above the rows beside him.
 */
export function minHeight(n: Node): number {
  if (n === null || n === undefined || n === false || n === true) return 0
  if (typeof n === 'string' || typeof n === 'number') return String(n) === '' ? 0 : String(n).split('\n').length
  // Children handed over bare sit side by side, as in a row: the tallest.
  if (Array.isArray(n)) return n.reduce((m: number, c) => Math.max(m, minHeight(c)), 0)
  if (typeof n !== 'object') return 0
  const el = n as El
  const p = el.props ?? {}
  const kids = flat(el.children ?? p.children)
  switch (el.type) {
    case 'Text': {
      const text = textOf(kids)
      return text === '' ? 0 : text.split('\n').length
    }
    case 'Button':
    case 'Link':
      return 1
    case 'Raster':
      return num(p.rows)
    case 'engine':
      return 0
    case 'Box':
    case 'Progress':
    case undefined: {
      if (typeof p.height === 'number') return Math.max(0, p.height)
      const edge =
        num(p.padding) * 2 + num(p.paddingY) * 2 + num(p.paddingTop) + num(p.paddingBottom) +
        signed(p.margin) * 2 + signed(p.marginY) * 2 + signed(p.marginTop) + signed(p.marginBottom) +
        (p.borderStyle ? 2 : 0)
      const heights = kids.map(minHeight)
      const gap = num(p.rowGap ?? p.gap)
      const inner = isRow(p)
        ? heights.reduce((m, h) => Math.max(m, h), 0)
        : heights.reduce((s, h) => s + h, 0) + gap * Math.max(0, heights.filter((h) => h > 0).length - 1)
      return Math.max(0, inner + edge)
    }
    default:
      if (typeof p.height === 'number') return Math.max(0, p.height)
      return kids.reduce((m: number, c) => Math.max(m, minHeight(c)), 0)
  }
}
