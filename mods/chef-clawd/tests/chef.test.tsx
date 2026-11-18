import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderPropsOf, UiBlitArgs } from 'claude-code'

import { ACTS, programme, workingSvg } from '../hooks/scene'
import * as term from '../hooks/terminal/chef'
import { QUADRANTS, base64 } from '../hooks/terminal/pixels'

// A shuffle that comes out the same on every run.
const seeded = (a: number) => () => {
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1)

// A browser skips a looping animation it cannot read, silently: each needs
// as many key times as values, times rising from 0, a smooth one ending on 1,
// and an eased one a spline per step.
const expectPlayable = (source: string) => {
  const tags = [...source.matchAll(/<animate(?:Transform)? [^>]*repeatCount="indefinite"[^>]*keyTimes[^>]*>/g)].map(m => m[0])
  expect(tags.length).toBeGreaterThan(0)
  for (const tag of tags) {
    const attr = (name: string) => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]
    const mode = attr('calcMode')
    const times = (attr('keyTimes') ?? '').split(';').map(Number)
    expect((attr('values') ?? '').split(';')).toHaveLength(times.length)
    expect(times[0]).toBe(0)
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
    if (mode === 'discrete') expect(times[times.length - 1]).toBeLessThanOrEqual(1)
    else expect(times[times.length - 1]).toBe(1)
    if (mode === 'spline') expect((attr('keySplines') ?? '').split(';')).toHaveLength(times.length - 1)
    else expect(attr('keySplines')).toBeUndefined()
  }
}

const band = (isWorking: boolean, hasSurvey = false): RenderPropsOf['AbovePrompt'] => ({
  hasSurvey,
  isWorking,
  maxRows: 20,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
})

// Hooks registered beneath the plugin, so before the test first calls $.
// The engine finds Martha's skill file above the working directory; in the
// Martha checkout that directory also holds the marketplace file naming
// martha-meal-planning. `where` 'home' stands for the copy of the skill in
// ~/.claude/skills, above every folder in the home directory, with no
// marketplace beside it. The engine's own band is a Text: 'engine band'.
const martha = (on: On, where: 'checkout' | 'home' = 'checkout') => {
  const dir = where === 'checkout' ? '/home/me/martha-meal-planning' : '/home/me'
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.ancestors', () => ({
    value: [{ dir, name: '.claude/skills/martha/SKILL.md', content: 'Martha', parts: [] }],
  }))
  on('fs.read', (_, e) => {
    // The host may hand the path on in this machine's spelling (C:\home\me\...).
    if (where === 'checkout' && e.path.replace(/\\/g, '/').endsWith('martha-meal-planning/.claude-plugin/marketplace.json')) {
      return { value: '{ "name": "martha-meal-planning", "plugins": [] }' }
    }
    return { deny: `ENOENT: ${e.path}` }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine band'] }) as never)
}
// A fresh session, so what the last test's session found is forgotten.
const start = ($: Engine) => $.session.start({ cwd: '/home/me/martha-meal-planning', surface: 'terminal', isInteractive: true })

const target = (surface: 'desktop' | 'vscode' | 'mobile', props: RenderPropsOf['AbovePrompt']) =>
  ({ plugin: 'chef-clawd', surface, component: 'AbovePrompt', props }) as const

test('idle chef, then stirring the saucepan while a turn runs', async ($, on) => {
  martha(on)
  await start($)
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount(target(surface, band(false)))
    const idle = await ui.find({ type: 'Svg' })
    expect(idle?.props.alt).toBe('Chef Clawd with a ladle')
    expect(String(idle?.props.source)).not.toContain('animateTransform')

    await ui.redraw(band(true))
    const stirring = await ui.find({ type: 'Svg' })
    expect(stirring?.props.alt).toBe('Chef Clawd stirring a saucepan')
    expect(String(stirring?.props.source)).toContain('animateTransform')
    expect(stirring?.props.isInteractive).toBe(true)
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(1)

    await ui.redraw(band(false))
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Chef Clawd with a ladle')
    await ui.unmount()
  }
})

test('drawn on the app background, idle and working', async ($, on) => {
  martha(on)
  await start($)
  for (const isWorking of [false, true]) {
    const ui = await $.ui.mount(target('desktop', band(isWorking)))
    // Since Claude Code 2.1.327 the host wraps a plugin's band in its own Box,
    // so the chef's background is on the Box that holds his drawing.
    const boxes = await ui.findAll({ type: 'Box' })
    const chefBox = boxes.find((b) => (b.children ?? []).some((c: any) => c?.type === 'Svg'))
    expect(chefBox?.props.backgroundColor).toBe('#FCFCFB')
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(1)
    await ui.unmount()
  }
})

test('the ladle goes from the idle pose to the saucepan before the stirring starts', async ($, on) => {
  martha(on)
  await start($)
  const ui = await $.ui.mount(target('desktop', band(true)))
  const source = String((await ui.find({ type: 'Svg' }))?.props.source)
  // The ladle starts in the idle pose, lowers to the saucepan and holds there.
  expect(source).toContain('rotate(-18)')
  expect(source).toContain('values="-18;-58"')
  expect(source).toContain('fill="freeze"')
  expect(source).toContain('begin="0.15s"')
  // Then the stirring starts.
  expect(source).toContain('begin="0.5s"')
  await ui.unmount()
})

test('the desktop kitchen has no cauldron: nothing rises, and he rests at the range', () => {
  for (const seed of SEEDS) {
    const source = workingSvg(programme(ACTS, seeded(seed)))
    // No pot riding up from below the frame, and no cauldron's round belly.
    expect(source).not.toContain('values="0 7;0 -0.5;0 0"')
    expect(source).not.toContain('<ellipse cx="-6"')
    expect(source).not.toContain('Q -6 4.9')
    // The drawing is 84 wide and he stands 14 in from its right edge, as idle.
    expect(source).toContain('viewBox="-31 -9 84 17"')
    expect(source).toContain('translate(39 0)')
  }
})

test('steps aside for a survey', async ($, on) => {
  martha(on)
  await start($)

  for (const surface of ['desktop', 'terminal'] as const) {
    const survey = await $.ui.mount({ plugin: 'chef-clawd', surface, component: 'AbovePrompt', props: band(true, true) })
    expect(await survey.find({ type: 'Svg' })).toBeUndefined()
    expect(await survey.find({ type: 'Raster' })).toBeUndefined()
    expect(await survey.find({ text: 'engine band' })).toBeDefined()
    await survey.unmount()
  }
})

test('every animation in a prompt is one the browser plays', () => {
  for (const seed of SEEDS) expectPlayable(workingSvg(programme(ACTS, seeded(seed))))
  for (const act of ACTS) expectPlayable(workingSvg({ cycle: act.length + 3, acts: [{ act, at: 1.5 }] }))
})

test('a whole prompt fits in one drawing', () => {
  for (const seed of SEEDS) {
    expect(workingSvg(programme(ACTS, seeded(seed))).length).toBeLessThan(131072)
  }
})

test('each act once per pass, each after 4 to 8 seconds of stirring', () => {
  for (const seed of SEEDS) {
    const p = programme(ACTS, seeded(seed))
    expect(p.acts.map(({ act }) => act.name).sort()).toEqual(ACTS.map(act => act.name).sort())
    let free = 0
    for (const { act, at } of p.acts) {
      expect(at - free).toBeGreaterThanOrEqual(4)
      expect(at - free).toBeLessThanOrEqual(8)
      free = at + act.length
    }
    // The programme ends as its last act does, then starts over with a rest.
    expect(Math.abs(p.cycle - free)).toBeLessThan(1e-6)
  }
})

test('one programme per prompt, kept through redraws', async ($, on) => {
  martha(on)
  await start($)
  const ui = await $.ui.mount(target('desktop', band(true)))
  const first = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(first).toContain('translate(39 0)')
  await ui.redraw(band(true))
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toBe(first)
  await ui.redraw(band(false))
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Chef Clawd with a ladle')
  await ui.redraw(band(true))
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('translate(39 0)')
  await ui.unmount()
})

// ------------------------------------------------------------ the terminal

const terminal = (props: RenderPropsOf['AbovePrompt']) =>
  ({ plugin: 'chef-clawd', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props }) as const

// Unpacks a Raster's cells back into [codePoint, fg, bg] words.
const decode = (cells: string): number[] => {
  const bin = atob(cells)
  const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0))
  return [...new Uint32Array(bytes.buffer)]
}

const expectCells = (props: Record<string, unknown>) => {
  const words = decode(String(props.cells))
  expect(words).toHaveLength(Number(props.columns) * Number(props.rows) * 3)
  for (let i = 0; i < words.length; i += 3) {
    // A space, a quadrant block or the taste test's heart: one printable,
    // width-one character.
    expect([...QUADRANTS, 0x2665]).toContain(words[i])
    for (const c of [words[i + 1], words[i + 2]]) expect(c === 0x01000000 || c! <= 0xffffff).toBe(true)
  }
  return words
}

test('the terminal draws the idle chef as cells, right-aligned', async ($, on) => {
  martha(on)
  await start($)
  const ui = await $.ui.mount(terminal(band(false)))
  const raster = await ui.find({ type: 'Raster' })
  expect(raster?.props.columns).toBe(term.IDLE_COLUMNS)
  expect(raster?.props.rows).toBe(term.HEIGHT / 2)
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(1)
  const words = expectCells(raster!.props)
  // Clay pixels are there: he is drawn, not a blank box.
  expect(words.filter((w, i) => i % 3 && w === 0xd97757).length).toBeGreaterThan(10)
  expect((await ui.find({ type: 'Box' }))?.props.flexDirection).toBe('column')
  await ui.unmount()
})

test('while a prompt runs the terminal chef animates, and stops after', async ($, on) => {
  martha(on)
  const clock = mock.clock(on)
  const blits: UiBlitArgs[] = []
  on('ui.blit', (_, e) => {
    blits.push(e)
    return { value: {} }
  })
  await start($)

  const ui = await $.ui.mount(terminal(band(true)))
  const raster = await ui.find({ type: 'Raster' })
  expect(raster?.props.columns).toBe(term.WORK_COLUMNS)
  expectCells(raster!.props)

  await clock.advance(3000)
  expect(blits.length).toBeGreaterThanOrEqual(20)
  for (const b of blits) {
    expect(b.requestId).toBe('band')
    expect('key' in b && b.key).toBe('chef')
    expectCells({ cells: 'cells' in b ? b.cells : '', columns: term.WORK_COLUMNS, rows: term.HEIGHT / 2 })
  }
  // The frames change: the cauldron rises, the ladle sweeps.
  expect(new Set(blits.map(b => ('cells' in b ? b.cells : ''))).size).toBeGreaterThan(5)

  await ui.redraw(band(false))
  expect((await ui.find({ type: 'Raster' }))?.props.columns).toBe(term.IDLE_COLUMNS)
  const after = blits.length
  await clock.advance(2000)
  expect(blits.length).toBe(after)
  await ui.unmount()
})

test('two drawings at once start one timer, and the idle drawing stops it', async ($, on) => {
  martha(on)
  const clock = mock.clock(on)
  const blits: UiBlitArgs[] = []
  on('ui.blit', (_, e) => {
    blits.push(e)
    return { value: {} }
  })
  await start($)

  const [a, b] = await Promise.all([
    $.ui.mount(terminal(band(true))),
    $.ui.mount({ ...terminal(band(true)), requestId: 'band-2' }),
  ])
  await clock.advance(1000)
  // One timer draws 8 frames a second; a second one left over would double it.
  expect(blits.length).toBeLessThanOrEqual(9)

  await a.redraw(band(false))
  const after = blits.length
  await clock.advance(2000)
  expect(blits.length).toBe(after)
  await a.unmount()
  await b.unmount()
})

test('the session ending stops the terminal timer', async ($, on) => {
  martha(on)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  const clock = mock.clock(on)
  let blits = 0
  on('ui.blit', () => {
    blits++
    return { value: {} }
  })
  await start($)
  const ui = await $.ui.mount(terminal(band(true)))
  await clock.advance(500)
  expect(blits).toBeGreaterThan(0)

  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: {} as never })
  const after = blits
  await clock.advance(2000)
  expect(blits).toBe(after)
  await ui.unmount()
})

test('a session opened in a Windows clone of any name finds the checkout', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.ancestors', () => ({
    value: [{ dir: 'C:\\Users\\me\\Code\\Martha', name: '.claude/skills/martha/SKILL.md', content: 'Martha', parts: [] }],
  }))
  on('fs.read', (_, e) =>
    e.path.replace(/\\/g, '/') === 'C:/Users/me/Code/Martha/.claude-plugin/marketplace.json'
      ? { value: '{ "name": "martha-meal-planning", "plugins": [] }' }
      : { deny: `ENOENT: ${e.path}` },
  )
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine band'] }) as never)
  await $.session.start({ cwd: 'C:\\Users\\me\\Code\\Martha', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(terminal(band(false)))
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  await ui.unmount()
})

test('the terminal keeps the engine band and adds him beneath it', async ($, on) => {
  martha(on)
  await start($)
  const ui = await $.ui.mount(terminal(band(false)))
  expect(await ui.find({ text: 'engine band' })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  await ui.unmount()
})

test('a band too narrow for him is left to the engine', async ($, on) => {
  martha(on)
  await start($)
  const ui = await $.ui.mount(terminal({ ...band(true), bodyColumns: term.WORK_COLUMNS - 1 }))
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ text: 'engine band' })).toBeDefined()
  await ui.unmount()
})

test('outside the Martha checkout he never appears, even under a home folder holding the skill', async ($, on) => {
  martha(on, 'home')
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const isWorking of [false, true]) {
      const ui = await $.ui.mount({ plugin: 'chef-clawd', surface, component: 'AbovePrompt', props: band(isWorking) })
      expect(await ui.find({ type: 'Raster' })).toBeUndefined()
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      expect(await ui.find({ text: 'engine band' })).toBeDefined()
      await ui.unmount()
    }
  }
})

test('every terminal act is drawn, inside the frame, once per pass', () => {
  for (const seed of SEEDS) {
    const p = term.programme(term.ACTS, seeded(seed))
    expect(p.acts.map(({ act }) => act.name).sort()).toEqual(term.ACTS.map(a => a.name).sort())
    for (const { act, at } of p.acts) {
      const mid = term.actAt(p, at + act.length / 2)
      expect(mid?.act.name).toBe(act.name)
    }
  }
  // Each act's frames differ from plain stirring and from each other.
  for (const act of term.ACTS) {
    const solo = { cycle: term.RISE + act.length + 50, acts: [{ act, at: term.RISE }] }
    const frames = [0.1, 0.5, 0.9].map(k => term.workingFrame(solo, term.RISE + act.length * k).cells())
    expect(new Set(frames).size).toBeGreaterThan(1)
    const stir = term.workingFrame({ cycle: 1000, acts: [] }, term.RISE + act.length / 2).cells()
    for (const f of frames) expect(f).not.toBe(stir)
  }
})

test('cells are packed as standard base64', () => {
  expect(base64(new Uint8Array([]))).toBe('')
  expect(base64(new Uint8Array([102]))).toBe('Zg==')
  expect(base64(new Uint8Array([102, 111]))).toBe('Zm8=')
  expect(base64(new Uint8Array([102, 111, 111, 98, 97, 114]))).toBe('Zm9vYmFy')
})
