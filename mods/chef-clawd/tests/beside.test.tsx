// Tests for Chef Clawd beside the band's other rows: how narrow and how short
// their trees can get, where he goes, and the band as the terminal draws it.
import { expect, test } from 'claude-code/testing'
import type { RenderPropsOf } from 'claude-code'

import { CHEF_MIN, CHEF_ROWS, minHeight, minWidth, place } from '../hooks/beside'

const el = (type: string, props: Record<string, unknown> = {}, ...children: unknown[]) => ({ type, props, children })

// One row of a to-do list as a mod draws it: fixed controls, a title cut at its end.
const todoRow = el(
  'Box',
  {},
  el(
    'Box',
    { flexShrink: 0 },
    el('Box', { width: 3 }, el('Button', { label: '[ ]' })),
    el('Box', { width: 5 }, el('Button', { label: '#17' })),
    el('Text', {}, '|'),
    el('Box', { width: 12 }),
    el('Text', {}, ' '),
  ),
  el('Text', { wrap: 'truncate' }, 'Look over the preview and test-drive Martha as a stranger'),
)
const header = el('Box', { flexWrap: 'wrap' }, el('Button', { label: '[-]' }), el('Text', {}, ' To-dos '), el('Button', { label: 'Show Done' }))
// A list of five, with what its own next(e) handed back: draws nothing in a mod's row.
const todoBand = el('Box', { flexDirection: 'column' }, header, todoRow, todoRow, todoRow, todoRow, todoRow, { type: 'engine', ref: 2 })
// The same list folded to its one line.
const folded = el('Box', {}, el('Button', { label: '[+]' }), el('Text', {}, ' To-dos 10 open'))

test('a cut-off title shrinks to one cell, the controls do not', () => {
  expect(minWidth(todoRow)).toBe(3 + 5 + 1 + 12 + 1 + 1)
})

test('a word that cannot wrap is as wide as it is', () => {
  expect(minWidth(el('Box', {}, el('Text', {}, 'short ' + 'x'.repeat(100))))).toBe(100)
})

test('a fixed-width box and padding count in full', () => {
  expect(minWidth(el('Box', { paddingX: 2 }, el('Box', { width: 30 }), el('Text', {}, 'ab')))).toBe(36)
})

test('a column is as wide as its widest child, a row the sum', () => {
  const a = el('Text', {}, 'aaaa')
  const b = el('Text', {}, 'bbbbbb')
  expect(minWidth(el('Box', { flexDirection: 'column' }, a, b))).toBe(6)
  expect(minWidth(el('Box', {}, a, b))).toBe(10)
})

test('an element it cannot read counts as too wide, so he steps aside', () => {
  expect(minWidth(el('Box', {}, el('Svg', {})))).toBe(Infinity)
})

test('a column is as tall as its children stacked, a row its tallest', () => {
  const a = el('Text', {}, 'one')
  const b = el('Text', {}, 'two\nthree')
  expect(minHeight(el('Box', { flexDirection: 'column' }, a, b))).toBe(3)
  expect(minHeight(el('Box', {}, a, b))).toBe(2)
  expect(minHeight(el('Box', { paddingY: 1, borderStyle: 'round' }, a))).toBe(5)
})

test('a list of five is six rows, folded one', () => {
  expect(minHeight(todoBand)).toBe(6)
  expect(minHeight(folded)).toBe(1)
})

test('an element it cannot read counts as no rows, so he is never lifted too high', () => {
  expect(minHeight(el('Svg', {}))).toBe(0)
})

test('beside a list of five he takes the right quarter and rises his full height', () => {
  expect(place([todoBand], 100)).toEqual({ width: 25, room: 75, lift: CHEF_ROWS })
})

test('beside a folded list he rises one row, so he never pokes above it', () => {
  expect(place([folded], 100)?.lift).toBe(1)
})

test('on a narrow band his share never goes under his widest drawing', () => {
  expect(place([folded], 60)).toEqual({ width: CHEF_MIN, room: 60 - CHEF_MIN, lift: 1 })
})

test('a row that cannot get out of his quarter sends him out of the band', () => {
  expect(place([el('Box', { width: 90 })], 100)).toBeUndefined()
})

// The band's arrangement as the terminal asks for it.
const chefRow = el('Box', { width: '100%', justifyContent: 'flex-end' }, el('Raster', { key: 'chef', columns: 10, rows: 4, cells: '' }))
const list = (rows: { plugin: string; tree: unknown }[], surface = 'terminal'): RenderPropsOf['AbovePromptList'] =>
  ({
    rows,
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  }) as unknown as RenderPropsOf['AbovePromptList']

const find = (n: unknown, key: string): { props: Record<string, unknown> } | undefined => {
  if (!n || typeof n !== 'object') return undefined
  const e = n as { key?: unknown; props?: Record<string, unknown>; children?: unknown }
  if (e.key === key || e.props?.key === key) return e as { props: Record<string, unknown> }
  for (const c of [e.children].flat()) {
    const hit = find(c, key)
    if (hit) return hit
  }
  return undefined
}

test('in the terminal his Box starts at his quarter, so clicks on the rows beside him reach them', async ($) => {
  const ui = await $.ui.mount({
    plugin: 'chef-clawd',
    surface: 'terminal',
    component: 'AbovePromptList',
    props: list([
      { plugin: 'todo-band', tree: todoBand },
      { plugin: 'chef-clawd@martha-meal-planning', tree: chefRow },
    ]),
  })
  const tree = await ui.drawn()
  expect(find(tree, 'others')?.props).toMatchObject({ paddingRight: 25 })
  const chef = find(tree, 'chef')?.props
  expect(chef).toMatchObject({ marginLeft: 75, marginTop: -CHEF_ROWS })
  expect(chef?.alignSelf).toBeUndefined()
})

test('alone in the band, or on another surface, he leaves the band as it is', async ($) => {
  const alone = await $.ui.mount({
    plugin: 'chef-clawd',
    surface: 'terminal',
    component: 'AbovePromptList',
    props: list([{ plugin: 'chef-clawd@martha-meal-planning', tree: chefRow }]),
  })
  expect(find(await alone.drawn(), 'others')).toBeUndefined()
  const desktop = await $.ui.mount({
    plugin: 'chef-clawd',
    surface: 'desktop',
    component: 'AbovePromptList',
    props: list([
      { plugin: 'todo-band', tree: todoBand },
      { plugin: 'chef-clawd@martha-meal-planning', tree: chefRow },
    ]),
  })
  expect(find(await desktop.drawn(), 'others')).toBeUndefined()
})
