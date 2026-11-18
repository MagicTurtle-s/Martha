// Chef Clawd for the terminal, drawn as Claude Code draws its own logo: flat
// colour in quadrant blocks, two by two pixels to a cell, four rows tall.
// His body is the logo's, pixel for pixel, eyes left open to the terminal's
// background; a toque sits on top. Animated frame by frame from the time
// since the prompt began. Clawd's right hand is the viewer's left, so the
// ladle and the cauldron sit on the left, as on the desktop.

import { Canvas, type Pixel } from './pixels'

const CLAY = 0xd97757
const HAT = 0xe4ded3
const STEEL = 0x9aa0a8
const POT = 0x4a4643
const SOUP = 0x7bae5a
const BUBBLE = 0xb5dc97
const STEAM = 0x8f8a84
const FLAME = 0xf08a24
const FLAME_HOT = 0xffd23f
const SMOKE = 0x8a8580
const PANCAKE = 0xe0b062
const PANCAKE_DARK = 0xb98537
const BOARD = 0xa8743f
const CARROT = 0xf28c28
const LEAF = 0x6fb043
const EGG = 0xf3ecdc
const HEART = 0xe8577a

// The logo, read off its quadrant characters ( ▐▛███▜▌ / ▝▜█████▛▘ / ▘▘ ▝▝).
const BODY = [
  '...CCCCCCCCCCCC...',
  '...CC.CCCCCC.CC...',
  '.CCCCCCCCCCCCCCCC.',
  '...CCCCCCCCCCCC...',
  '....C.C....C.C....',
]
const BODY_BLINK = BODY.map((row, i) => (i === 1 ? row.replace(/\./g, (d, j) => (j > 3 && j < 14 ? 'C' : d)) : row))

// A toque: wide on top, narrow at the band.
const TOQUE = ['...HHHHHHHHHHHH...', '.....HHHHHHHH.....']

const PALETTE: Record<string, Pixel> = { C: CLAY, H: HAT }

export const HEIGHT = 8 // pixels: four terminal rows
const BODY_W = 18
const BODY_Y = 2
const HAND_Y = BODY_Y + 2 // the arms' row
// Pixels are half a cell wide, so every width here is an even count.
const IDLE_X = 2
export const IDLE_COLUMNS = (IDLE_X + BODY_W) / 2

const POT_X = 0
const POT_W = 12
const RIM_Y = 4
const CHEF_X_WORK = 22
export const WORK_COLUMNS = (CHEF_X_WORK + BODY_W + 2) / 2

const chef = (c: Canvas, x: number, opts: { lift?: number; blink?: boolean } = {}) => {
  const y = -(opts.lift ?? 0)
  c.sprite(x, y, TOQUE, PALETTE)
  c.sprite(x, BODY_Y + y, opts.blink ? BODY_BLINK : BODY, PALETTE)
}

const isBlink = (t: number) => t % 5.2 > 5.0

// The ladle held up at his hand: a handle and a two-pixel bowl on top.
const raisedLadle = (c: Canvas, x: number) => {
  c.line(x, HAND_Y - 1, x, 1, STEEL)
  c.rect(x - 1, 0, 2, 1, STEEL)
}

export const idleFrame = (t = 0): Canvas => {
  const c = new Canvas(IDLE_X * 2 + BODY_W - IDLE_X, HEIGHT)
  raisedLadle(c, IDLE_X)
  chef(c, IDLE_X, { blink: isBlink(t) })
  return c
}

// ---------------------------------------------------------------- the pot

const pot = (c: Canvas, dy: number, t: number) => {
  const top = RIM_Y + dy
  c.rect(POT_X + 1, top, POT_W - 2, 1, SOUP)
  c.set(POT_X, top, POT)
  c.set(POT_X + POT_W - 1, top, POT)
  // Bubbles that come and go on the surface.
  for (const [bx, phase] of [
    [3, 0],
    [8, 0.7],
  ] as const) {
    const p = (t + phase) % 1.4
    if (p < 0.6) c.set(POT_X + bx, top, BUBBLE)
  }
  c.rect(POT_X, top + 1, POT_W, 1, POT)
  c.rect(POT_X + 1, top + 2, POT_W - 2, 1, POT)
  c.set(POT_X + 2, top + 3, POT)
  c.set(POT_X + POT_W - 3, top + 3, POT)
}

// Steam: wisps that leave the soup and fade as they rise.
const steam = (c: Canvas, t: number) => {
  for (const [x, phase] of [
    [3, 0],
    [8, 1.1],
  ] as const) {
    const p = ((t + phase) % 2.2) / 2.2
    const y = RIM_Y - 1 - Math.floor(p * 4)
    if (p < 0.75) c.set(POT_X + x + (y % 2), y, STEAM)
  }
}

// ---------------------------------------------------------------- acts

export type Act = {
  name: string
  length: number // seconds
  // Draws the act at `t` seconds into it; `x` is the chef's left edge.
  draw: (c: Canvas, t: number, x: number) => void
}

// Left leaning in the pot while his hands are busy.
const restingLadle = (c: Canvas) => c.line(POT_X + POT_W - 1, RIM_Y - 3, POT_X + POT_W - 4, RIM_Y, STEEL)

const kitchenFire: Act = {
  name: 'the kitchen fire',
  length: 4,
  draw(c, t, x) {
    const blaze = t < 2.6
    restingLadle(c)
    if (blaze) {
      const grow = Math.min(1, t / 0.6)
      for (let i = 1; i < POT_W - 1; i++) {
        const flicker = Math.sin(t * 18 + i * 1.3)
        const h = Math.max(1, Math.round((2 + (i % 2) + flicker) * grow))
        for (let k = 0; k < h; k++) c.set(POT_X + i, RIM_Y - 1 - k, k < h - 1 ? FLAME_HOT : FLAME)
      }
    } else {
      const p = (t - 2.6) / 1.4
      for (let i = 0; i < 4; i++) c.set(POT_X + 2 + i * 3, RIM_Y - 1 - Math.floor(p * 4) - (i % 2), SMOKE)
    }
    const lift = blaze && Math.floor(t * 6) % 2 ? 1 : 0
    chef(c, x, { lift })
    // Arms up in alarm while it burns.
    if (blaze) {
      c.set(x + 1, HAND_Y - 1 - lift, CLAY)
      c.set(x + BODY_W - 2, HAND_Y - 1 - lift, CLAY)
    }
  },
}

// A pan at his hand; the pancake goes up and lands, twice, and the third time
// it never comes down.
const pancakeFlip: Act = {
  name: 'a pancake flip',
  length: 4.5,
  draw(c, t, x) {
    restingLadle(c)
    chef(c, x)
    c.rect(x - 9, HAND_Y, 10, 1, STEEL)
    const flip = t % 1.5
    const n = Math.floor(t / 1.5)
    let cy = HAND_Y - 1
    if (n < 2) {
      if (flip < 1) cy = HAND_Y - 1 - Math.round(Math.sin(flip * Math.PI) * 3)
    } else {
      cy = HAND_Y - 1 - Math.round(Math.min(1, flip / 0.6) * 6)
    }
    const up = n < 2 ? Math.floor(flip * 6) % 2 === 0 : true
    c.rect(x - 8, cy, 4, 1, up ? PANCAKE : PANCAKE_DARK)
  },
}

const chopping: Act = {
  name: 'chopping',
  length: 3.5,
  draw(c, t, x) {
    restingLadle(c)
    chef(c, x)
    const bx = POT_X + POT_W + 2
    // The board on the floor between the pot and him.
    c.rect(bx, HEIGHT - 1, 8, 1, BOARD)
    // The carrot gets shorter as slices pile up.
    const cut = Math.min(4, Math.floor(t / 0.7))
    c.rect(bx + 1 + cut, HEIGHT - 2, 5 - cut, 1, CARROT)
    c.set(bx + 6, HEIGHT - 2, LEAF)
    c.set(bx + 7, HEIGHT - 3, LEAF)
    for (let i = 0; i < cut; i++) c.set(bx + i, HEIGHT - 2, i % 2 ? CARROT : 0xd9701a)
    // The knife goes up and down by his hand.
    const down = Math.floor(t * 5) % 2 === 1
    const kx = bx + 1 + cut
    const ky = down ? HEIGHT - 3 : HEIGHT - 4
    c.line(kx, ky - 1, kx, ky, STEEL)
    c.line(x + 1, HAND_Y, kx + 1, ky - 1, CLAY)
  },
}

const eggJuggling: Act = {
  name: 'egg juggling',
  length: 4,
  draw(c, t, x) {
    restingLadle(c)
    chef(c, x)
    // Three eggs on a loop above his hand.
    const cx = x - 4
    const cy = 3
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i * Math.PI * 2) / 3
      c.set(cx + Math.round(Math.cos(a) * 4), cy + Math.round(Math.sin(a) * 2.5), EGG)
    }
  },
}

const tasteTest: Act = {
  name: 'a taste test',
  length: 3,
  draw(c, t, x) {
    // He lifts the ladle from the pot to his mouth; a heart rises: it's good.
    const lift = Math.min(1, t / 0.6)
    const fromX = POT_X + 5
    const fromY = RIM_Y
    const ex = Math.round(fromX + (x + 4 - fromX) * lift)
    const ey = Math.round(fromY + (BODY_Y + 2 - fromY) * lift)
    c.line(x + 1, HAND_Y, ex, ey, STEEL)
    chef(c, x, { blink: t > 0.8 && t < 1.6 })
    c.rect(ex - 1, ey, 2, 1, STEEL)
    // A heart rises beside his toque, one character tall: it's good.
    if (t > 1) c.glyph((x + BODY_W) / 2, Math.max(0, 1 - Math.floor((t - 1) * 1.2)), 0x2665, HEART)
  },
}

export const ACTS: Act[] = [kitchenFire, pancakeFlip, chopping, eggJuggling, tasteTest]

// ---------------------------------------------------------------- the programme

export type Programme = { cycle: number; acts: { act: Act; at: number }[] }

export const RISE = 0.9
const REST_MIN = 4
const REST_MAX = 8

// Each act once, shuffled for this prompt, after a rest of 4 to 8 seconds;
// then the programme repeats, so none comes round twice before all have.
export const programme = (acts: Act[] = ACTS, random: () => number = Math.random): Programme => {
  const order = [...acts]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  let t = RISE
  const placed = order.map(act => {
    t += REST_MIN + random() * (REST_MAX - REST_MIN)
    const at = t
    t += act.length
    return { act, at }
  })
  return { cycle: t + REST_MIN, acts: placed }
}

// Which act is playing at `t` seconds into the prompt, and how far into it.
export const actAt = (p: Programme, t: number): { act: Act; t: number } | undefined => {
  if (t < RISE) return undefined
  const local = RISE + ((t - RISE) % (p.cycle - RISE))
  for (const { act, at } of p.acts) if (local >= at && local < at + act.length) return { act, t: local - at }
  return undefined
}

// The working frame at `t` seconds after the prompt began.
export const workingFrame = (p: Programme, t: number): Canvas => {
  const c = new Canvas(WORK_COLUMNS * 2, HEIGHT)
  const x = CHEF_X_WORK

  // The cauldron rides up from below and settles.
  if (t < RISE) {
    const k = t / RISE
    const ease = 1 - Math.pow(1 - k, 3)
    pot(c, Math.round(4 * (1 - ease)), t)
    raisedLadle(c, x + 1)
    chef(c, x)
    return c
  }

  const playing = actAt(p, t)
  steam(c, t)
  if (playing) {
    pot(c, 0, t)
    playing.act.draw(c, playing.t, x)
    return c
  }

  // Stirring: the ladle's bowl sweeps across the soup for the first half of
  // each 3.6 second cycle and rests for the second.
  const s = (t - RISE) % 3.6
  const sweep = s < 1.8 ? Math.sin((s / 1.8) * Math.PI * 2) : 0
  const sx = POT_X + 6 + 2 * Math.round(sweep * 1.5)
  pot(c, 0, t)
  c.line(x + 1, HAND_Y, sx + 2, RIM_Y - 1, STEEL)
  c.rect(sx, RIM_Y, 2, 1, STEEL)
  chef(c, x, { blink: isBlink(t) })
  return c
}
