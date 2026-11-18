// Oven check. The kitchen timer dings; he goes to the oven, opens it and
// takes a puff of steam in the face, lifts out a pie, shuts the door, sets
// the pie on the counter to cool and admires it.

import { OVEN, REST_X, TIMER, ovenDoor } from '../kitchen'
import { actor, bang, pie, walkTime } from '../sprites'
import { during, fade, move, xy, zoom, type Act, type Key, type Slot } from '../timeline'

const DING = 0.9 // the timer rings this long before he sets off
const AT = 37 // just right of the oven door
const ARRIVE = DING + walkTime(REST_X, AT)
const OPEN = ARRIVE + 0.1
const STEAM = OPEN + 0.25
const LIFT = OPEN + 1.4
const HELD = LIFT + 0.6
const SHUT = HELD + 0.3
const COOL_X = 4 // in front of the counter's left end
const PLACE = SHUT + walkTime(AT, COOL_X)
const SET = PLACE + 0.3
const DONE = SET + 0.9
const LENGTH = DONE + walkTime(COOL_X, REST_X)

// The pie on its rack, in his paw (his units), and on the counter.
const RACK = xy(29, OVEN.y + 3.3)
const HOLD = { x: -2.3, y: 2.3 }
const SILL = xy(2.8, 1)

const PATH: Key[] = [
  [0, xy(REST_X, 0)],
  [DING, xy(REST_X, 0)],
  [ARRIVE, xy(AT, 0)],
  [STEAM, xy(AT, 0)],
  [STEAM + 0.2, xy(AT + 1.5, 0), 'out'],
  [LIFT - 0.2, xy(AT + 1.5, 0)],
  [LIFT, xy(AT, 0), 'inOut'],
  [SHUT, xy(AT, 0)],
  [PLACE, xy(COOL_X, 0)],
  [SET + 0.2, xy(COOL_X, 0)],
  [SET + 0.4, xy(COOL_X, -0.8), 'out'],
  [SET + 0.6, xy(COOL_X, 0), 'in'],
  [DONE, xy(COOL_X, 0)],
  [LENGTH, xy(REST_X, 0)],
]

// The timer rattles and rings.
const ding = () =>
  `<g transform="translate(${xy(TIMER.x + TIMER.w / 2, TIMER.y + TIMER.h)})">` +
  `<g><animateTransform attributeName="transform" type="rotate" values="-8;8;-8" dur="0.12s" repeatCount="indefinite"/>` +
  `<rect x="${-TIMER.w / 2}" y="${-TIMER.h}" width="${TIMER.w}" height="${TIMER.h}" fill="#E2574C"/>` +
  `<rect x="${-TIMER.w / 2 + 0.4}" y="${-TIMER.h + 0.3}" width="1.1" height="0.9" fill="#FFFFFF"/></g>` +
  [
    [-2, -2.4, -35],
    [0, -3, 0],
    [2, -2.4, 35],
  ]
    .map(
      ([x, y, a]) =>
        `<rect x="${x - 0.15}" y="${y - 0.5}" width="0.3" height="1" fill="#F2B632" transform="rotate(${a} ${x} ${y})">` +
        `<animate attributeName="opacity" values="1;0.2;1" dur="0.3s" repeatCount="indefinite"/></rect>`,
    )
    .join('') +
  `</g>`

// Inside the open oven: dark, warm at the bottom, a rack. The door drops
// open to a strip at its foot and comes back up.
const oven = (s: Slot) =>
  during(
    s,
    [[OPEN, SHUT + 0.3]],
    `<rect x="${OVEN.x}" y="${OVEN.y}" width="${OVEN.w}" height="${OVEN.h}" fill="#2B2725"/>` +
      `<rect x="${OVEN.x + 0.5}" y="${OVEN.y + OVEN.h - 0.8}" width="${OVEN.w - 1}" height="0.5" fill="#E8743B" opacity="0.8"/>` +
      `<rect x="${OVEN.x + 0.6}" y="${OVEN.y + 3.3}" width="${OVEN.w - 1.2}" height="0.15" fill="#8E949C"/>`,
  ) +
  during(s, [[OPEN, LIFT]], `<g transform="translate(${RACK})">${pie()}</g>`) +
  during(
    s,
    [[OPEN, SHUT + 0.3]],
    `<g transform="translate(0 ${OVEN.y + OVEN.h})"><g>${zoom(s, [
      [OPEN, '1 1'],
      [OPEN + 0.3, '1 0.12', 'out'],
      [HELD, '1 0.12'],
      [SHUT, '1 1', 'in'],
    ])}<g transform="translate(0 ${-(OVEN.y + OVEN.h)})">${ovenDoor()}</g></g></g>`,
  )

// A cloud from the open oven, drifting up into his face.
const puff = (s: Slot, t: number, x: number, r: number, dx: number) =>
  `<g transform="translate(${xy(x, OVEN.y + 1)})"><circle r="${r}" fill="#FFFFFF" stroke="#D8D2C8" stroke-width="0.15" opacity="0">` +
  fade(
    s,
    [
      [t, 0],
      [t + 0.1, 0.95],
      [t + 1.1, 0, 'in'],
    ],
    0,
  ) +
  move(s, [
    [t, xy(0, 0)],
    [t + 1.1, xy(dx, -3.5), 'out'],
  ]) +
  `</circle></g>`

// Out of the oven into his paw; and once set down, cooling on the counter.
const lifted = (s: Slot) =>
  during(
    s,
    [[LIFT, HELD]],
    `<g>${move(s, [
      [LIFT, RACK],
      [HELD, xy(AT + HOLD.x, HOLD.y), 'out'],
    ])}${pie()}</g>`,
  )

const cooling = (s: Slot) =>
  during(
    s,
    [[SET, LENGTH]],
    `<g transform="translate(${SILL})"><g>${fade(s, [
      [LENGTH - 0.4, 1],
      [LENGTH, 0],
    ])}${pie()}` +
      [0, 0.5]
        .map(
          (begin, i) =>
            `<rect x="${-0.7 + i * 1.1}" y="-1.4" width="0.5" height="1" fill="#D8D2C8" opacity="0">` +
            `<animate attributeName="opacity" values="0;0.8;0" dur="1.4s" begin="${begin}s" repeatCount="indefinite"/>` +
            `<animate attributeName="y" values="-1.4;-3.6" dur="1.4s" begin="${begin}s" repeatCount="indefinite"/></rect>`,
        )
        .join('') +
      `</g></g>`,
  )

export const ovenCheck: Act = {
  name: 'Oven check',
  length: LENGTH,
  beats: [
    [0.4, 'the timer dings'],
    [ARRIVE - 0.4, 'off to the oven'],
    [STEAM + 0.3, 'steam in the face'],
    [LIFT + 0.3, 'lifts out a pie'],
    [SHUT + 0.6, 'carries it over'],
    [SET + 0.4, 'sets it down to cool'],
    [DONE + 0.4, 'back to the pot'],
  ],
  draw: s =>
    during(
      s,
      [[0, LENGTH]],
      during(s, [[0, DING + 0.4]], ding()) +
        oven(s) +
        actor(s, {
          length: LENGTH,
          path: PATH,
          look: {
            left: [[0, DING]],
            blank: [[STEAM, LIFT - 0.2]],
            down: [[LIFT - 0.2, HELD]],
            happy: [[SET, DONE]],
          },
          walk: [
            [DING, ARRIVE],
            [SHUT, PLACE],
            [DONE, LENGTH],
          ],
          front:
            // Left of his hat: at the pot he is at the drawing's edge.
            during(s, [[0.1, DING]], `<g transform="translate(-1.4 -8.6)">${bang()}</g>`) +
            during(s, [[HELD, SET]], `<g transform="translate(${xy(HOLD.x, HOLD.y)})"><g>${move(s, [
              [PLACE, xy(0, 0)],
              [SET, xy(2.8 - COOL_X - HOLD.x, 1 - HOLD.y), 'out'],
            ])}${pie()}</g></g>`),
        }) +
        [0, 0.15, 0.3, 0.45].map((d, i) => puff(s, STEAM + d, 26 + i * 2.2, 1 + (i % 2) * 0.5, 11 - i * 1.6)).join('') +
        lifted(s) +
        cooling(s),
    ),
}
