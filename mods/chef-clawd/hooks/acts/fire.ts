// Kitchen fire. He cooks at the range with his back turned; the pan flares
// up, he jumps back facing us, and sprays it with an extinguisher to no use.
// A spark lights his hat, he runs back and forth trailing smoke until it burns
// out (the pan goes out on its own), stares, swaps the burnt hat for a clean
// one from behind his back, adjusts it and walks back to the pot.
//
// The times below are on the act's first clock, which had a long walk in
// from the far end. He now rests beside the range, so the act starts at
// SETOFF on that clock and ends at END; `draw` shifts its slot to match.

import { HAT_EDGE } from '../art'
import { LEFT, PAN, REST_X } from '../kitchen'
import {
  FIRE_CORE,
  SMOKE,
  actor,
  bang,
  charredHat,
  extinguisher,
  flame,
  hatRig,
  spatula,
  toque,
  walkTime,
  wisp,
} from '../sprites'
import { during, fade, move, num, sample, turn, xy, zoom, type Act, type Key, type Slot } from '../timeline'

const COOK_X = 27 // in front of the range, the pan just at his left
const BACK_X = 33 // where he lands after the flare-up
const STARE_X = 30
const AT_RANGE = 1.55
const SETOFF = Math.round((AT_RANGE - walkTime(REST_X, COOK_X)) * 100) / 100
const END = Math.round((14.7 + walkTime(STARE_X, REST_X)) * 100) / 100
const LENGTH = Math.round((END - SETOFF) * 100) / 100
// Where he turns on the open floor, his burning hat clear of the edge.
const FAR_X = LEFT + 15

// His feet's corner, over the whole act.
const PATH: Key[] = [
  [SETOFF, xy(REST_X, 0)],
  [AT_RANGE, xy(COOK_X, 0)],
  [3.8, xy(COOK_X, 0)],
  [4.0, xy(COOK_X + 3, -2.5), 'out'],
  [4.2, xy(BACK_X, 0), 'in'],
  [7.3, xy(BACK_X, 0)],
  [8.5, xy(FAR_X, 0)],
  [9.83, xy(38, 0)],
  [10.23, xy(STARE_X, 0), 'out'],
  [14.7, xy(STARE_X, 0)],
  [END, xy(REST_X, 0)],
]

// The nozzle, while he holds the extinguisher level at BACK_X.
const NOZZLE = { x: BACK_X - 2.6, y: 1.1 }

const sizzle = () =>
  [0, 0.4, 0.8]
    .map(
      (begin, i) =>
        `<rect x="${num(PAN.x - 2 + i * 1.6)}" y="0" width="0.5" height="1" fill="${HAT_EDGE}" opacity="0">` +
        `<animate attributeName="opacity" values="0;0.8;0" dur="1.2s" begin="${begin}s" repeatCount="indefinite"/>` +
        `<animate attributeName="y" values="-0.5;-3" dur="1.2s" begin="${begin}s" repeatCount="indefinite"/></rect>`,
    )
    .join('')

const panFire = (s: Slot) =>
  `<g transform="translate(${xy(PAN.x, PAN.y + 0.1)})"><g>` +
  zoom(s, [
    [3.3, 0.01],
    [3.45, 0.35, 'out'],
    [3.6, 0.35],
    [3.85, 1.1, 'out'],
    [4.0, 1],
    [6.5, 1],
    [6.8, 1.2, 'out'],
    [10.3, 1.2],
    [10.6, 0.01, 'in'],
  ]) +
  flame() +
  `</g></g>`

const spray = () =>
  [0, 0.12, 0.24, 0.36]
    .map(
      (begin, i) =>
        `<circle cx="${num(NOZZLE.x)}" cy="${num(NOZZLE.y)}" r="${0.55 + (i % 2) * 0.3}" fill="#FFFFFF" ` +
        `stroke="#CFC9BF" stroke-width="0.15" opacity="0">` +
        `<animate attributeName="cx" values="${num(NOZZLE.x)};${num(PAN.x + 0.5)}" dur="0.48s" begin="${begin}s" repeatCount="indefinite"/>` +
        `<animate attributeName="cy" values="${num(NOZZLE.y)};${num(PAN.y - 0.4 - (i % 3) * 0.6)}" dur="0.48s" begin="${begin}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0.95;0" dur="0.48s" begin="${begin}s" repeatCount="indefinite"/></circle>`,
    )
    .join('')

const puff = (s: Slot, t: number, x: number, y: number, r: number, rise: number, life: number) =>
  `<g transform="translate(${xy(x, y)})"><circle r="${num(r)}" fill="${SMOKE}" opacity="0">` +
  fade(
    s,
    [
      [t, 0],
      [t + 0.08, 0.75],
      [t + life, 0, 'out'],
    ],
    0,
  ) +
  move(s, [
    [t, xy(0, 0)],
    [t + life, xy(0, -rise), 'out'],
  ]) +
  `</circle></g>`

// Smoke left behind his burning hat as he runs, and a burst where the pan
// goes out.
const smoke = (s: Slot) => {
  let out = ''
  let i = 0
  for (let t = 7.45; t < 10.25; t += 0.3, i++) {
    const [x] = sample(PATH, t)
    out += puff(s, t, x + 6.5, -7, i % 2 ? 1.1 : 0.8, 1.6, 1)
  }
  for (const [t, dx] of [
    [10.5, -1],
    [10.65, 1],
    [10.8, 0],
  ])
    out += puff(s, t, PAN.x + dx, -1, 1.2, 2.4, 1.2)
  return out
}

const spark = (s: Slot) =>
  during(
    s,
    [[6.5, 6.9]],
    `<g>${move(s, [
      [6.5, xy(PAN.x + 0.5, -4)],
      [6.7, xy(BACK_X - 0.5, -8.5), 'out'],
      [6.9, xy(BACK_X + 6.5, -7.6), 'in'],
    ])}<rect x="-0.4" y="-0.4" width="0.8" height="0.8" fill="${FIRE_CORE}"/></g>`,
  )

// Dropped when his hat catches: falls, bounces once and lies there.
const dropped = (s: Slot) =>
  `<g opacity="0">${fade(
    s,
    [
      [7.0, 1, 'hold'],
      [END - 0.4, 1],
      [END, 0],
    ],
    0,
  )}<g>${move(s, [
    [7.0, xy(BACK_X + 0.6, 2.5)],
    [7.3, xy(BACK_X + 2, 5.9), 'in'],
    [7.4, xy(BACK_X + 2.2, 5.6), 'out'],
    [7.5, xy(BACK_X + 2.3, 5.9), 'in'],
  ])}<g>${turn(s, [
    [7.0, 0],
    [7.3, 90, 'in'],
  ])}${extinguisher()}</g></g></g>`

const hatFlame = (s: Slot, x: number, y: number, size: number) =>
  `<g transform="translate(${xy(x, y)})"><g>${zoom(s, [
    [6.9, 0.01],
    [7.1, size, 'out'],
    [10.25, size],
    [10.6, 0.01, 'in'],
  ])}${flame()}</g></g>`

// The hat on his head, then the burnt one in his hand, then the clean one.
const hats = (s: Slot) =>
  during(s, [[0, 10.45]], toque()) +
  // Low on the hat, so the flames wrap it and stay inside the frame.
  during(
    s,
    [[6.9, 10.6]],
    hatFlame(s, 6.5, -3.9, 0.7) + hatFlame(s, 10.2, -3.2, 0.42) + hatFlame(s, 3, -2.9, 0.36),
  ) +
  during(
    s,
    [[10.45, 12.85]],
    hatRig(
      s,
      charredHat() + during(s, [[10.45, 12.4]], wisp(9.5, -7.4) + wisp(4, -6.6)),
      [
        [10.45, xy(0, 0)],
        [12.4, xy(0, 0)],
        [12.8, xy(7.5, 4), 'inOut'],
      ],
      [
        [10.45, 1],
        [12.4, 1],
        [12.8, 0.75, 'inOut'],
      ],
    ),
  ) +
  during(
    s,
    [[13.6, END]],
    hatRig(
      s,
      toque(),
      [
        [13.6, xy(-8, 4)],
        [13.95, xy(0, 0), 'out'],
      ],
      [
        [13.6, 0.75],
        [13.95, 1, 'out'],
      ],
      [
        [13.95, '0 6.5 0'],
        [14.1, '-8 6.5 0'],
        [14.25, '6 6.5 0'],
        [14.35, '-3 6.5 0'],
        [14.45, '0 6.5 0'],
      ],
    ),
  )

// Behind his back: the burnt hat going in, the clean one coming out.
const behind = (s: Slot) =>
  during(
    s,
    [[12.85, 13.3]],
    hatRig(
      s,
      charredHat(),
      [
        [12.85, xy(7.5, 4)],
        [13.2, xy(0.5, 6), 'inOut'],
      ],
      [
        [12.85, 0.75],
        [13.2, 0.45],
      ],
    ),
  ) +
  during(
    s,
    [[13.3, 13.6]],
    hatRig(
      s,
      toque(),
      [
        [13.3, xy(0.5, 6)],
        [13.6, xy(-8, 4), 'out'],
      ],
      [
        [13.3, 0.45],
        [13.6, 0.75],
      ],
    ),
  )

const held = (s: Slot) =>
  during(
    s,
    [[1.55, 3.8]],
    `<g transform="translate(0.6 2.5)"><g>` +
      `<animateTransform attributeName="transform" type="rotate" values="-55;-66;-55" dur="0.6s" repeatCount="indefinite"/>` +
      `${spatula()}</g></g>`,
  ) +
  during(
    s,
    [[4.6, 7.0]],
    `<g transform="translate(0.6 2.5)"><g>${turn(s, [
      [4.6, 70],
      [4.75, 0, 'out'],
    ])}<g>` +
      `<animateTransform attributeName="transform" type="rotate" values="0;-3;2;0" dur="0.14s" repeatCount="indefinite"/>` +
      `${extinguisher()}</g></g></g>`,
  ) +
  during(
    s,
    [
      [3.8, 4.5],
      [6.9, 7.4],
    ],
    `<g transform="translate(13.4 -8.6)">${bang()}</g>`,
  )

// Back to front: the pan and what falls or trails, him, then what flies.
const scene = (s: Slot) =>
  during(s, [[1.7, 3.3]], sizzle()) +
  during(s, [[3.3, 10.6]], panFire(s)) +
  dropped(s) +
  smoke(s) +
  actor(s, {
    length: END,
    path: PATH,
    back: [[AT_RANGE, 3.8]],
    look: {
      wide: [
        [3.8, 4.6],
        [6.9, 10.45],
      ],
      blank: [[10.45, 12.4]],
    },
    walk: [
      [SETOFF, AT_RANGE],
      [14.7, END],
    ],
    run: [[7.3, 10.23]],
    hat: hats(s),
    behind: behind(s),
    front: held(s),
  }) +
  during(s, [[4.85, 6.9]], spray()) +
  spark(s)

export const fire: Act = {
  name: 'Kitchen fire',
  length: LENGTH,
  beats: [
    [SETOFF + 0.2, 'steps to the range'],
    [2.6, 'cooks, back turned'],
    [3.5, 'the pan catches'],
    [4.0, 'jumps back'],
    [4.4, 'faces us, shocked'],
    [5.6, 'sprays it, no use'],
    [6.75, 'a spark flies'],
    [7.2, 'his hat catches'],
    [8.3, 'runs, trailing smoke'],
    [9.5, 'and back again'],
    [10.7, 'the hat burns out'],
    [11.5, 'blank stare'],
    [12.75, 'takes the burnt hat'],
    [13.15, 'stuffs it behind him'],
    [13.5, 'pulls out a clean one'],
    [13.8, 'puts it on'],
    [14.12, 'adjusts it'],
    [END - 0.1, 'back to the pot'],
  ].map(([t, caption]): [number, string] => [Math.round((Number(t) - SETOFF) * 100) / 100, String(caption)]),
  draw: s => {
    const shifted: Slot = { at: s.at - SETOFF, cycle: s.cycle }
    return during(shifted, [[SETOFF, END]], scene(shifted))
  },
}
