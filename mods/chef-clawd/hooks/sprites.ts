// Chef Clawd in parts, for the acts: units and colours as in art.ts, his body's
// top-left corner at the origin, his hat above it, his feet at y 7.

import { CLAY, EYE, STEEL, STEEL_DARK, TOQUE, hat, rects, type Rect } from './art'
import { during, merge, move, turn, without, zoom, type Key, type Slot, type Window } from './timeline'

export const FIRE = '#EA6A2A'
export const FIRE_CORE = '#F7C548'
export const SMOKE = '#A8A29A'
const CHAR = '#4A4542'
const CHAR_EDGE = '#2B2826'
const ASH = '#6E6964'
const RED = '#D6453D'
const RED_DARK = '#A8322C'
const WHITE = '#FFFFFF'
const WOOD = '#7A5A3A'

export const torso = () =>
  rects(
    [
      [2, 0, 9, 5],
      [0, 2, 2, 1],
      [11, 2, 2, 1],
    ],
    CLAY,
  )

// Legs in two pairs, so a step lifts one pair while the other stands.
const LEGS_A: Rect[] = [
  [3, 5, 1, 2],
  [7, 5, 1, 2],
]
const LEGS_B: Rect[] = [
  [5, 5, 1, 2],
  [9, 5, 1, 2],
]
const lift = (period: number, first: boolean) =>
  `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${period}s" ` +
  `repeatCount="indefinite" values="${first ? '0 -0.7;0 0' : '0 0;0 -0.7'}"/>`

export const legs = () => rects([...LEGS_A, ...LEGS_B], CLAY)
export const steppingLegs = (period: number) =>
  `<g>${lift(period, true)}${rects(LEGS_A, CLAY)}</g><g>${lift(period, false)}${rects(LEGS_B, CLAY)}</g>`

export const eyes = {
  normal: () =>
    rects(
      [
        [4, 1.5, 1, 1],
        [8, 1.5, 1, 1],
      ],
      EYE,
    ),
  wide: () =>
    rects(
      [
        [3.75, 1, 1.5, 1.7],
        [7.75, 1, 1.5, 1.7],
      ],
      EYE,
    ) +
    rects(
      [
        [3.95, 1.2, 0.5, 0.5],
        [7.95, 1.2, 0.5, 0.5],
      ],
      WHITE,
    ),
  // Flat and half shut: thick enough to read at the app's size.
  blank: () =>
    rects(
      [
        [3.7, 1.9, 1.6, 0.7],
        [7.7, 1.9, 1.6, 0.7],
      ],
      EYE,
    ),
  up: () =>
    rects(
      [
        [4, 0.9, 1, 1],
        [8, 0.9, 1, 1],
      ],
      EYE,
    ),
  down: () =>
    rects(
      [
        [4, 2.3, 1, 1],
        [8, 2.3, 1, 1],
      ],
      EYE,
    ),
  left: () =>
    rects(
      [
        [3.4, 1.5, 1, 1],
        [7.4, 1.5, 1, 1],
      ],
      EYE,
    ),
  // Pleased, eyes shut in two little arches.
  happy: () =>
    rects(
      [
        [3.6, 2, 0.6, 0.5],
        [4.1, 1.5, 0.8, 0.5],
        [4.8, 2, 0.6, 0.5],
        [7.6, 2, 0.6, 0.5],
        [8.1, 1.5, 0.8, 0.5],
        [8.8, 2, 0.6, 0.5],
      ],
      EYE,
    ),
}
export type Look = Exclude<keyof typeof eyes, 'normal'>

// Both arms up, for a shrug or a reach above the counter; drawn over his
// usual arms, which then read as long ones.
export const armsUp = () =>
  rects(
    [
      [-0.3, 0.6, 2, 1.6],
      [11.3, 0.6, 2, 1.6],
    ],
    CLAY,
  )

// His walking pace in units a second, and how long a walk takes.
export const WALK = 28
export const walkTime = (from: number, to: number) => Math.round((Math.abs(to - from) / WALK) * 100) / 100

const charredHatArt = () =>
  rects(TOQUE, CHAR_EDGE, 0.35) +
  rects(TOQUE, CHAR) +
  rects(
    [
      [2.6, -4, 1.4, 0.8],
      [9, -6.4, 1, 0.8],
    ],
    ASH,
  ) +
  rects(
    [
      [4, -6, 1, 0.6],
      [8, -4.5, 1.2, 0.6],
      [6, -7.4, 0.8, 0.5],
    ],
    FIRE,
  )

// A hat that leaves his head: offset from its place, scaled about its middle
// and tipped about its brim. The keys are the act's own times.
export const hatRig = (slot: Slot, inner: string, offset: Key[], size: Key[], tilt?: Key[]) =>
  `<g>${move(slot, offset)}<g transform="translate(6.5 -4)"><g>${zoom(slot, size)}` +
  `<g transform="translate(-6.5 4)">${tilt ? `<g>${turn(slot, tilt)}${inner}</g>` : inner}</g></g></g></g>`

// A flame about six units tall, its base at the origin. Two frames swap, the
// second mirrored, so it flickers.
const FLAME: Rect[] = [
  [-3, -1, 6, 1],
  [-3, -2, 6, 1],
  [-2.5, -3, 5, 1],
  [-2, -4, 3.5, 1],
  [-1.5, -5, 2.5, 1],
  [-1, -6, 1.5, 1],
  [2, -4.5, 1, 1.5],
  [-3.5, -3, 1, 1],
]
const CORE: Rect[] = [
  [-2, -1, 4, 1],
  [-1.5, -2, 3, 1],
  [-1, -3, 2, 1],
  [-0.5, -4, 1, 1],
]
const flicker = (first: boolean) =>
  `<animate attributeName="opacity" calcMode="discrete" dur="0.26s" repeatCount="indefinite" values="${first ? '1;0' : '0;1'}"/>`
const flameArt = () => {
  const frame = rects(FLAME, FIRE) + rects(CORE, FIRE_CORE)
  return `<g>${flicker(true)}${frame}</g><g transform="scale(-1 1)">${flicker(false)}${frame}</g>`
}

// Held at its handle (the origin), the nozzle pointing to the left.
const extinguisherArt = () =>
  rects([[-1, -1, 2, 4.4]], RED) +
  rects([[0.5, -1, 0.5, 4.4]], RED_DARK) +
  rects([[-1, 0.6, 2, 0.8]], WHITE) +
  rects([[-0.5, -1.8, 1, 0.8]], STEEL_DARK) +
  rects(
    [
      [-2.6, -1.6, 2.1, 0.4],
      [-3.2, -1.8, 0.6, 0.8],
    ],
    EYE,
  )

// Held at the end of its handle (the origin), the blade up: wide, thin and
// slotted, so it reads as a spatula and not a mallet.
export const spatula = () =>
  rects([[-0.25, -3.6, 0.5, 3.8]], WOOD) +
  rects([[-1.3, -5.6, 2.6, 2.1]], '#C3C7CC') +
  rects(
    [
      [-0.75, -5.2, 0.3, 1.3],
      [0.45, -5.2, 0.3, 1.3],
    ],
    STEEL_DARK,
  )

// Each drawn once per drawing and placed with <use>, which keeps a whole
// prompt's drawing well under the Svg element's size limit.
export const defs = () =>
  `<defs><g id="cc-hat">${hat()}</g><g id="cc-charred">${charredHatArt()}</g>` +
  `<g id="cc-flame">${flameArt()}</g><g id="cc-extinguisher">${extinguisherArt()}</g></defs>`
export const toque = () => '<use href="#cc-hat"/>'
export const charredHat = () => '<use href="#cc-charred"/>'
export const flame = () => '<use href="#cc-flame"/>'
export const extinguisher = () => '<use href="#cc-extinguisher"/>'

// Held at the end of its handle (the origin), the blade up.
export const knife = () =>
  rects([[-0.3, -1.4, 0.6, 1.6]], '#3B3836') +
  rects([[-0.45, -4.6, 0.9, 3.2]], '#C3C7CC') +
  rects([[0.2, -4.6, 0.25, 3.2]], STEEL_DARK)

// A pancake, its middle at the origin.
export const pancake = () =>
  `<rect x="-2.1" y="-0.35" width="4.2" height="0.7" rx="0.35" fill="#E8B76A"/>` +
  rects(
    [
      [-1.2, -0.25, 0.5, 0.25],
      [0.6, -0.2, 0.6, 0.2],
    ],
    '#C98F45',
  )

// A brown egg standing on its bottom (the origin), so a wobble tips it there.
export const egg = () => `<ellipse cx="0" cy="-0.65" rx="0.5" ry="0.65" fill="#E9C9A3" stroke="#B89470" stroke-width="0.18"/>`

// A lattice pie in its tin, standing on its bottom middle (the origin).
export const pie = () =>
  rects([[-1.6, -0.55, 3.2, 0.55]], STEEL) +
  rects([[-1.4, -1, 2.8, 0.6]], '#D9A05B') +
  rects(
    [
      [-1, -1, 0.35, 0.6],
      [0, -1, 0.35, 0.6],
      [0.9, -1, 0.35, 0.6],
      [-1.4, -0.85, 2.8, 0.2],
    ],
    '#B87A3A',
  )

// The salt, held at its base (the origin), cap up.
export const shaker = () => rects([[-0.5, -1.7, 1, 1.9]], WHITE) + rects([[-0.5, -2.1, 1, 0.45]], STEEL)

export const question = () =>
  rects(
    [
      [0, 0, 1.6, 0.5],
      [1.2, 0.4, 0.5, 0.9],
      [0.6, 1.2, 0.7, 0.5],
      [0.6, 1.6, 0.5, 0.5],
      [0.6, 2.4, 0.5, 0.5],
    ],
    '#4A6FA5',
  )

export const heart = () =>
  rects(
    [
      [0, 0, 0.8, 0.6],
      [1.1, 0, 0.8, 0.6],
      [-0.2, 0.4, 2.3, 0.7],
      [0.2, 1.1, 1.5, 0.5],
      [0.6, 1.6, 0.7, 0.4],
    ],
    '#E2574C',
  )

export const drop = () => `<rect x="0" y="0" width="0.5" height="0.75" rx="0.25" fill="#8EC5E8"/>`

export const bang = () =>
  rects(
    [
      [0, 0, 0.7, 1.8],
      [0, 2.2, 0.7, 0.6],
    ],
    '#C2362F',
  )

export const wisp = (x: number, y: number) =>
  `<rect x="${x}" y="${y}" width="0.6" height="1.2" fill="${SMOKE}" opacity="0">` +
  `<animate attributeName="opacity" values="0;0.7;0" dur="1.1s" repeatCount="indefinite"/>` +
  `<animate attributeName="y" values="${y};${y - 1.6}" dur="1.1s" repeatCount="indefinite"/></rect>`

// Chef Clawd walking through an act. `path` puts his body's corner in the
// kitchen; the windows say when he faces away, which eyes he wears and when
// his legs step; `hat`, `behind` and `front` are drawn in his own units.
export type Plan = {
  length: number
  path: Key[]
  back?: Window[]
  look?: Partial<Record<Look, Window[]>>
  walk?: Window[]
  run?: Window[]
  hat?: string
  behind?: string
  front?: string
}

export const actor = (slot: Slot, p: Plan) => {
  const all: Window[] = [[0, p.length]]
  const back = merge(p.back ?? [])
  const looks = Object.entries(p.look ?? {}).map(([name, ws]) => [name as Look, without(ws ?? [], back)] as const)
  const usual = without(without(all, back), looks.flatMap(([, ws]) => ws))
  const walk = merge(p.walk ?? [])
  const run = merge(p.run ?? [])
  const still = without(all, [...walk, ...run])
  return (
    `<g>${move(slot, p.path)}` +
    (p.behind ?? '') +
    during(slot, still, legs()) +
    during(slot, walk, steppingLegs(0.34)) +
    during(slot, run, steppingLegs(0.16)) +
    torso() +
    during(slot, usual, eyes.normal()) +
    looks.map(([name, ws]) => during(slot, ws, eyes[name]())).join('') +
    (p.hat ?? toque()) +
    (p.front ?? '') +
    `</g>`
  )
}
