// Prints the terminal Chef Clawd as ANSI truecolor text, so the frames can be
// looked at in a terminal without starting Claude Code.
//
//   node --import ./scripts/resolve-ts.mjs scripts/terminal-preview.ts [--act <name>] [--play]
//
// With no flags it prints the idle chef, the cauldron rising, a stir, and
// every act at a few moments. --act prints only that act; --play animates a
// whole shuffled prompt in place until Ctrl+C.

import { ACTS, RISE, idleFrame, programme, workingFrame, type Programme } from '../hooks/terminal/chef'
import { DEFAULT, QUADRANTS, ansi, type Canvas } from '../hooks/terminal/pixels'

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

// A programme with one act alone, starting right after the rise.
const solo = (name: string): Programme => {
  const act = ACTS.find(a => a.name === name)
  if (!act) throw new Error(`no act named ${name}; the acts are ${ACTS.map(a => a.name).join(', ')}`)
  return { cycle: RISE + act.length + 100, acts: [{ act, at: RISE }] }
}

const show = (title: string, text: string) => console.log(`\n${title}\n${text}`)

// --png <file>: every frame below drawn as a terminal would, cell by cell
// (each cell 8 x 16 px, the half-block glyph split top and bottom), on a dark
// and a light terminal background, stacked into one image.
const png = flag('--png')
if (png) {
  const { deflateSync } = await import('node:zlib')
  const { writeFileSync } = await import('node:fs')
  const frames: Canvas[] = [idleFrame()]
  const none: Programme = { cycle: 1000, acts: [] }
  frames.push(workingFrame(none, 0.3), workingFrame(none, 1.4), workingFrame(none, 2.2))
  for (const act of ACTS) {
    const p = solo(act.name)
    for (const at of [0.2, act.length * 0.4, act.length * 0.75]) frames.push(workingFrame(p, RISE + at))
  }
  const CW = 8
  const CH = 16
  const GAP = 8
  const cols = Math.max(...frames.map(f => f.columns))
  const tileW = cols * CW + GAP
  const tileH = 4 * CH + GAP
  const W = tileW * 2
  const H = tileH * frames.length
  const img = new Uint8Array(W * H * 3).fill(0x80)
  const put = (x: number, y: number, c: number) => {
    const k = (y * W + x) * 3
    img[k] = (c >> 16) & 255
    img[k + 1] = (c >> 8) & 255
    img[k + 2] = c & 255
  }
  frames.forEach((f, i) => {
    for (const [side, bgc] of [
      [0, 0x1e1e1e],
      [1, 0xfafafa],
    ] as const) {
      const ox = side * tileW
      const oy = i * tileH
      // Drawn from the cells the Raster gets: each glyph's lit quadrants in
      // its foreground, the rest in its background (or the terminal's).
      const w = f.words()
      for (let row = 0; row < f.rows; row++)
        for (let col = 0; col < cols; col++) {
          const k = (row * f.columns + col) * 3
          const inside = col < f.columns
          const mask = inside ? QUADRANTS.indexOf(w[k] as (typeof QUADRANTS)[number]) : 0
          const fg = inside && w[k + 1] !== DEFAULT ? w[k + 1]! : bgc
          const bg = inside && w[k + 2] !== DEFAULT ? w[k + 2]! : bgc
          for (let dy = 0; dy < CH; dy++)
            for (let dx = 0; dx < CW; dx++) {
              const bit = (dy < CH / 2 ? 0 : 2) + (dx < CW / 2 ? 0 : 1)
              put(ox + col * CW + dx, oy + row * CH + dy, mask & (1 << bit) ? fg : bg)
            }
        }
    }
  })
  const crc = (buf: Uint8Array) => {
    let c = ~0
    for (const b of buf) {
      c ^= b
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length)
    const v = new DataView(out.buffer)
    v.setUint32(0, data.length)
    out.set(new TextEncoder().encode(type), 4)
    out.set(data, 8)
    v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)))
    return out
  }
  const ihdr = new Uint8Array(13)
  const hv = new DataView(ihdr.buffer)
  hv.setUint32(0, W)
  hv.setUint32(4, H)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const raw = new Uint8Array(H * (W * 3 + 1))
  for (let y = 0; y < H; y++) raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (W * 3 + 1) + 1)
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]
  writeFileSync(png, Buffer.concat(parts))
  console.log(png)
  process.exit(0)
}

if (args.includes('--play')) {
  const p = programme()
  const start = Date.now()
  process.stdout.write('\x1b[?25l')
  process.on('SIGINT', () => {
    process.stdout.write('\x1b[?25h\n')
    process.exit(0)
  })
  let first = true
  setInterval(() => {
    const frame = ansi(workingFrame(p, (Date.now() - start) / 1000))
    if (!first) process.stdout.write(`\x1b[${frame.split('\n').length}A`)
    first = false
    process.stdout.write(frame + '\n')
  }, 100)
} else {
  const only = flag('--act')
  if (!only) {
    show('idle', ansi(idleFrame()))
    const none: Programme = { cycle: 1000, acts: [] }
    show('cauldron rising (0.3s)', ansi(workingFrame(none, 0.3)))
    show('stirring, left (1.4s)', ansi(workingFrame(none, 1.4)))
    show('stirring, right (2.2s)', ansi(workingFrame(none, 2.2)))
  }
  for (const act of ACTS.filter(a => !only || a.name === only)) {
    const p = solo(act.name)
    for (const at of [0.2, act.length * 0.4, act.length * 0.75]) {
      show(`${act.name} at ${at.toFixed(1)}s`, ansi(workingFrame(p, RISE + at)))
    }
  }
}
