// Times are seconds. A working drawing loops one programme: every animation in
// it lasts the whole cycle and repeats, so whatever is placed at `at` plays at
// `at` on every pass and the drawing needs no timers.

// Where an act sits in the programme: it starts `at` seconds into a cycle.
export type Slot = { at: number; cycle: number }

// A stretch of an act's own time, from its start.
export type Window = [from: number, to: number]

// How a value travels to its key; `hold` keeps the old value and cuts over.
export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'hold'
export type Key = [t: number, value: string | number, ease?: Ease]

export type Act = {
  name: string
  length: number
  // He takes the ladle out of the pot, so the pot is drawn without it.
  takesLadle?: boolean
  // Moments worth a still in the preview's storyboard: time and what happens.
  beats?: [t: number, caption: string][]
  draw: (slot: Slot) => string
}

const SPLINE = {
  linear: '0 0 1 1',
  in: '0.42 0 1 1',
  out: '0 0 0.58 1',
  inOut: '0.42 0 0.58 1',
}

// A held value changes this long before its key, so it reads as a cut.
const JUMP = 0.01
const EPS = 1e-6

export const num = (n: number) => String(Math.round(n * 1000) / 1000)
export const xy = (x: number, y: number) => `${num(x)} ${num(y)}`

type Point = { t: number; v: string; spline: string }

const points = (slot: Slot, keys: Key[], before?: string | number): Point[] => {
  const out: Point[] = []
  const add = (t: number, v: string, ease: Ease) => {
    const prev = out[out.length - 1]
    if (prev && t <= prev.t + EPS) throw new Error(`a key at ${num(t)}s is not after ${num(prev.t)}s`)
    if (ease === 'hold' && prev && t - JUMP > prev.t + EPS) out.push({ t: t - JUMP, v: prev.v, spline: SPLINE.linear })
    out.push({ t, v, spline: ease === 'hold' ? SPLINE.linear : SPLINE[ease] })
  }
  const start = slot.at + keys[0][0]
  if (start < -EPS) throw new Error(`a key at ${num(start)}s is before the cycle starts`)
  if (start > EPS) out.push({ t: 0, v: show(before ?? keys[0][1]), spline: SPLINE.linear })
  for (const [t, v, ease = 'linear'] of keys) add(slot.at + t, show(v), ease)
  const last = out[out.length - 1]
  if (last.t > slot.cycle + EPS) throw new Error(`a key at ${num(last.t)}s is past the cycle (${num(slot.cycle)}s)`)
  if (last.t < slot.cycle - EPS) out.push({ t: slot.cycle, v: last.v, spline: SPLINE.linear })
  else last.t = slot.cycle
  return out
}

const show = (v: string | number) => (typeof v === 'number' ? num(v) : v)

// Key times as fractions of the cycle; a smooth track ends on 1 exactly.
const times = (pts: Point[], cycle: number, endsOnOne = true) => {
  let prev = -1
  return pts
    .map((p, i) => {
      const k = endsOnOne && i === pts.length - 1 ? 1 : Math.round((p.t / cycle) * 1e6) / 1e6
      if (k <= prev) throw new Error(`two keys near ${num(p.t)}s land on the same moment`)
      prev = k
      return String(k)
    })
    .join(';')
}

// Straight lines need no splines, which keeps the drawing small.
const track = (head: string, slot: Slot, keys: Key[], before?: string | number) => {
  const pts = points(slot, keys, before)
  const splines = pts.slice(1).map(p => p.spline)
  const eased = splines.some(s => s !== SPLINE.linear)
  return (
    `<${head} dur="${num(slot.cycle)}s" repeatCount="indefinite" calcMode="${eased ? 'spline' : 'linear'}" ` +
    `keyTimes="${times(pts, slot.cycle)}" values="${pts.map(p => p.v).join(';')}"` +
    (eased ? ` keySplines="${splines.join(';')}"/>` : '/>')
  )
}

export const fade = (slot: Slot, keys: Key[], before?: number) =>
  track('animate attributeName="opacity"', slot, keys, before)
export const move = (slot: Slot, keys: Key[]) =>
  track('animateTransform attributeName="transform" type="translate"', slot, keys)
export const turn = (slot: Slot, keys: Key[]) =>
  track('animateTransform attributeName="transform" type="rotate"', slot, keys)
export const zoom = (slot: Slot, keys: Key[]) =>
  track('animateTransform attributeName="transform" type="scale"', slot, keys)

// Sorted, with touching and overlapping windows joined.
export const merge = (windows: Window[]): Window[] => {
  const out: Window[] = []
  for (const [from, to] of [...windows].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1]
    if (last && from <= last[1] + EPS) last[1] = Math.max(last[1], to)
    else out.push([from, to])
  }
  return out
}

export const without = (from: Window[], cut: Window[]): Window[] => {
  let out = merge(from)
  for (const [a, b] of merge(cut)) {
    out = out.flatMap(([f, t]): Window[] => {
      if (b <= f || a >= t) return [[f, t]]
      const parts: Window[] = []
      if (a > f) parts.push([f, a])
      if (b < t) parts.push([b, t])
      return parts
    })
  }
  return out.filter(([f, t]) => t - f > EPS)
}

// Opacity 1 inside the windows and 0 outside: each value holds until the
// next key time, so the cuts are exact.
export const shown = (slot: Slot, windows: Window[]) => {
  const at: number[] = [0]
  const values = ['0']
  for (const [from, to] of merge(windows)) {
    const [a, b] = [slot.at + from, slot.at + to]
    if (a <= EPS) {
      values[0] = '1'
    } else {
      at.push(a)
      values.push('1')
    }
    if (b < slot.cycle - EPS) {
      at.push(b)
      values.push('0')
    }
  }
  const keyTimes = times(
    at.map(t => ({ t, v: '', spline: '' })),
    slot.cycle,
    false,
  )
  return (
    `<animate attributeName="opacity" dur="${num(slot.cycle)}s" repeatCount="indefinite" calcMode="discrete" ` +
    `keyTimes="${keyTimes}" values="${values.join(';')}"/>`
  )
}

// Draws `inner` only within the windows.
export const during = (slot: Slot, windows: Window[], inner: string) =>
  windows.length ? `<g opacity="0">${shown(slot, windows)}${inner}</g>` : ''

// Where a path of "x y" keys is at `t`, straight between keys.
export const sample = (keys: Key[], t: number): [number, number] => {
  const at = (i: number) => String(keys[i][1]).split(' ').map(Number) as [number, number]
  if (t <= keys[0][0]) return at(0)
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [a, b] = [at(i - 1), at(i)]
      const f = (t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
    }
  }
  return at(keys.length - 1)
}
