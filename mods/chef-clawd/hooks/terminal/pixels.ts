// A small pixel canvas for the terminal, drawn the way Claude Code draws its
// own logo: each terminal cell holds a two-by-two square of pixels, shown as
// one of the quadrant block characters (▘ ▝ ▀ ▖ ▌ ▞ ▛ ▗ ▚ ▐ ▜ ▄ ▙ ▟ █) in
// one colour over the terminal's own background. A pixel is half a cell wide
// and half a cell tall, so they come out close to square.

export type Color = number // 0xRRGGBB
export type Pixel = Color | null // null: the terminal's own background

export const DEFAULT = 0x01000000 // RasterProps: bit 24 alone, the default color
const SPACE = 0x20
const FULL = 0x2588

// By which of the four quadrants are lit: top-left 1, top-right 2,
// bottom-left 4, bottom-right 8.
export const QUADRANTS = [
  SPACE, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b,
  0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, FULL,
] as const

export class Canvas {
  readonly px: Pixel[]
  readonly width: number
  readonly height: number
  constructor(width: number, height: number) {
    if (height % 2 || width % 2) throw new Error('a canvas is an even number of pixels each way')
    this.width = width
    this.height = height
    this.px = new Array(width * height).fill(null)
  }

  get columns() {
    return this.width / 2
  }
  get rows() {
    return this.height / 2
  }

  set(x: number, y: number, c: Pixel) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    this.px[y * this.width + x] = c
  }

  get(x: number, y: number): Pixel {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null
    return this.px[y * this.width + x] ?? null
  }

  rect(x: number, y: number, w: number, h: number, c: Pixel) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
  }

  // One character over a whole cell (a heart, a note), drawn over whatever
  // pixels the cell holds; `col` and `row` count cells.
  readonly glyphs = new Map<number, { code: number; color: Color }>()
  glyph(col: number, row: number, code: number, color: Color) {
    if (col < 0 || row < 0 || col >= this.columns || row >= this.rows) return
    this.glyphs.set(row * this.columns + col, { code, color })
  }

  // A straight line, end to end inclusive.
  line(x0: number, y0: number, x1: number, y1: number, c: Pixel) {
    x0 = Math.round(x0)
    y0 = Math.round(y0)
    x1 = Math.round(x1)
    y1 = Math.round(y1)
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      this.set(x0, y0, c)
      if (x0 === x1 && y0 === y1) return
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x0 += sx
      }
      if (e2 <= dx) {
        err += dx
        y0 += sy
      }
    }
  }

  // A sprite drawn from rows of characters; a character the palette lacks
  // (a dot, a space) leaves the pixel beneath it alone.
  sprite(x: number, y: number, rows: readonly string[], palette: Readonly<Record<string, Pixel>>) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]!
        if (ch in palette) this.set(x + i, y + j, palette[ch] ?? null)
      }
    })
  }

  // The cells as [codePoint, foreground, background] words, row-major. A cell
  // takes its commonest colour as the glyph's; a second colour, where the
  // cell has no empty pixel, is the cell's background; a third, or a second
  // beside an empty pixel, is dropped (the drawings keep such cells rare).
  words(): Uint32Array {
    const out = new Uint32Array(this.columns * this.rows * 3)
    let k = 0
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.columns; col++) {
        const quad = [
          this.get(col * 2, row * 2),
          this.get(col * 2 + 1, row * 2),
          this.get(col * 2, row * 2 + 1),
          this.get(col * 2 + 1, row * 2 + 1),
        ]
        const counts = new Map<Color, number>()
        for (const p of quad) if (p !== null) counts.set(p, (counts.get(p) ?? 0) + 1)
        const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
        let glyph: number = SPACE
        let fg = DEFAULT
        let bg = DEFAULT
        if (ranked.length) {
          fg = ranked[0]![0]
          let mask = 0
          quad.forEach((p, i) => {
            if (p === fg) mask |= 1 << i
          })
          if (ranked.length > 1 && !quad.includes(null)) bg = ranked[1]![0]
          glyph = QUADRANTS[mask]!
        }
        const over = this.glyphs.get(row * this.columns + col)
        if (over) {
          glyph = over.code
          fg = over.color
          bg = DEFAULT
        }
        out[k++] = glyph
        out[k++] = fg
        out[k++] = bg
      }
    }
    return out
  }

  // What a Raster's `cells` takes: padded base64 of the little-endian words.
  cells(): string {
    return base64(new Uint8Array(this.words().buffer))
  }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Standard padded base64; written out so it runs wherever the module does.
export const base64 = (bytes: Uint8Array): string => {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + '='
  }
  return out
}

// The same cells as ANSI truecolor text, for printing a frame in a terminal
// to look at it (the preview script and the tests use it).
export const ansi = (canvas: Canvas): string => {
  const w = canvas.words()
  const fg = (c: number) => (c === DEFAULT ? '\x1b[39m' : `\x1b[38;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`)
  const bg = (c: number) => (c === DEFAULT ? '\x1b[49m' : `\x1b[48;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`)
  const lines: string[] = []
  for (let row = 0; row < canvas.rows; row++) {
    let line = ''
    for (let x = 0; x < canvas.columns; x++) {
      const k = (row * canvas.columns + x) * 3
      line += fg(w[k + 1]!) + bg(w[k + 2]!) + String.fromCodePoint(w[k]!)
    }
    lines.push(line + '\x1b[0m')
  }
  return lines.join('\n')
}
