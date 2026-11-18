// Chopping. At the counter he chops the carrot on the board, quick knife
// work, and the slices hop over his head into the saucepan; then he wipes
// his brow and goes back to the pot.

import { CARROT, REST_X, SAUCEPAN, WALL, carrot } from '../kitchen'
import { actor, armsUp, drop, knife, walkTime } from '../sprites'
import { during, fade, move, num, xy, zoom, type Act, type Key, type Slot } from '../timeline'

const AT = 12.5 // just right of the board, reaching left onto it
const IN = walkTime(REST_X, AT)
const CHOP = IN + 0.3
const CHOPPED = CHOP + 4
const WIPE = CHOPPED + 0.1
const DONE = WIPE + 1
// He edges left as the carrot gets shorter, so the knife stays on its end.
const SHIFT = CARROT.w * 0.85
const LENGTH = DONE + walkTime(AT - SHIFT, REST_X)

const PATH: Key[] = [
  [0, xy(REST_X, 0)],
  [IN, xy(AT, 0)],
  [CHOP, xy(AT, 0)],
  [CHOPPED, xy(AT - SHIFT, 0)],
  [DONE, xy(AT - SHIFT, 0)],
  [LENGTH, xy(REST_X, 0)],
]

// How much carrot is left at `t`: it shortens from the right as he chops.
const left = (t: number) => 1 - 0.85 * Math.min(1, Math.max(0, (t - CHOP) / (CHOPPED - CHOP)))
const SLICES = [0, 1, 2, 3, 4].map(i => CHOP + 0.4 + i * 0.75)

const slice = (s: Slot, t: number) => {
  const x = CARROT.x + CARROT.w * left(t)
  const mid = (x + SAUCEPAN.x) / 2
  return during(
    s,
    [[t, t + 0.72]],
    `<g>${move(s, [
      [t, xy(x, CARROT.y + 0.2)],
      [t + 0.36, xy(mid, -8.4), 'out'],
      [t + 0.72, xy(SAUCEPAN.x, SAUCEPAN.y), 'in'],
    ])}<rect x="-0.3" y="-0.25" width="0.6" height="0.5" fill="#EE8A3C"/></g>`,
  )
}

// The carrot on the board while he works: the kitchen's own is hidden under
// a patch of wall, and this one shortens from the right.
const board = (s: Slot) =>
  `<rect x="${num(CARROT.x - 0.1)}" y="${num(CARROT.y - 0.5)}" width="${num(CARROT.w + 1.3)}" height="${num(CARROT.h + 0.5)}" fill="${WALL}"/>` +
  `<g transform="translate(${num(CARROT.x)} 0)"><g>${zoom(s, [
    [CHOP, '1 1'],
    [CHOPPED, `${num(left(CHOPPED))} 1`],
  ])}<g transform="translate(${num(-CARROT.x)} 0)">${carrot()}</g></g></g>`

// His arm up on the counter, the knife flat on the board and rocking.
const chopping = () =>
  armsUp() +
  `<g transform="translate(-0.2 0.3)"><g>` +
  `<animateTransform attributeName="transform" type="rotate" values="-92;-62;-92" dur="0.24s" repeatCount="indefinite"/>` +
  `${knife()}</g></g>`

// A paw across his brow, a shade darker than him so it shows over his face,
// and a drop of sweat flicked away.
const PAW = '#C4623F'
const wipe = (s: Slot) =>
  `<g>${move(s, [
    [WIPE, xy(0, 2)],
    [WIPE + 0.25, xy(2.5, 0.6), 'out'],
    [WIPE + 0.6, xy(9.5, 0.6), 'inOut'],
  ])}<rect x="0" y="0" width="2" height="1" fill="${PAW}"/></g>` +
  `<g opacity="0">${fade(
    s,
    [
      [WIPE + 0.55, 1, 'hold'],
      [WIPE + 1, 0],
    ],
    0,
  )}<g>${move(s, [
    [WIPE + 0.55, xy(11, 0.6)],
    [WIPE + 1, xy(14.5, 2.4), 'in'],
  ])}${drop()}</g></g>`

export const chop: Act = {
  name: 'Chopping',
  length: LENGTH,
  beats: [
    [IN - 0.6, 'walks to the counter'],
    [CHOP + 0.5, 'chops the carrot'],
    [SLICES[2] + 0.36, 'slices hop over him'],
    [SLICES[4] + 0.6, 'into the saucepan'],
    [WIPE + 0.4, 'wipes his brow'],
    [DONE + 0.8, 'back to the pot'],
  ],
  draw: s =>
    during(
      s,
      [[0, LENGTH]],
      during(s, [[CHOP, LENGTH]], board(s)) +
        actor(s, {
          length: LENGTH,
          path: PATH,
          look: { left: [[IN, CHOPPED]], happy: [[WIPE, DONE]] },
          walk: [
            [0, IN],
            [DONE, LENGTH],
          ],
          front: during(s, [[IN + 0.1, CHOPPED]], chopping()) + during(s, [[WIPE, WIPE + 0.65]], wipe(s)),
        }) +
        SLICES.map(t => slice(s, t)).join(''),
    ),
}
