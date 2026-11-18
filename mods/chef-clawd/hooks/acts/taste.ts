// Taste test. At the saucepan he lifts the ladle and sips, thinks it over,
// flicks in some salt, sips again and does a happy little bounce.

import { BASE, HAND, ladle } from '../art'
import { REST_X, SAUCEPAN } from '../kitchen'
import { actor, heart, shaker } from '../sprites'
import { during, fade, move, turn, xy, zoom, type Act, type Key, type Slot } from '../timeline'

const SALT = 2.8 // after a moment's thought
const SHAKE = SALT + 0.4
const SHAKEN = SHAKE + 0.9
const SIP_2 = SHAKEN + 0.6
const HAPPY = SIP_2 + 1.2
const LENGTH = HAPPY + 1.4

// The ladle about his hand: in the saucepan, up at his face, back again.
const LADLE: Key[] = [
  [0, BASE],
  [0.5, -10, 'inOut'],
  [0.8, 75, 'out'],
  [1.8, 75],
  [2.2, BASE, 'inOut'],
  [SIP_2, BASE],
  [SIP_2 + 0.4, 75, 'inOut'],
  [HAPPY, 75],
  [HAPPY + 0.5, BASE, 'inOut'],
]
// At the saucepan it is drawn behind him, as when he stirs; lifted, in front.
const IN_POT: [number, number][] = [
  [0, 0.15],
  [2.12, SIP_2 + 0.08],
  [HAPPY + 0.42, LENGTH],
]
const LIFTED: [number, number][] = [
  [0.15, 2.12],
  [SIP_2 + 0.08, HAPPY + 0.42],
]

const ladleAt = (s: Slot) => `<g transform="translate(${xy(REST_X + 0.6, 2.5)})"><g>${turn(s, LADLE)}${ladle()}</g></g>`

// Out from behind his back, tipped toward the saucepan and shaken.
const TIP = -60
const salt = (s: Slot) =>
  `<g transform="translate(${HAND})"><g>${turn(s, [
    [SALT, 0],
    [SHAKE, TIP, 'out'],
    [SHAKEN, TIP],
    [SHAKEN + 0.25, 0, 'in'],
  ])}<g>${zoom(s, [
    [SALT, 0.01],
    [SALT + 0.15, 1, 'out'],
  ])}<g>` +
  `<animateTransform attributeName="transform" type="translate" values="0 0;0 -0.35;0 0" dur="0.18s" repeatCount="indefinite"/>` +
  `${shaker()}</g></g></g></g>`

// Each grain leaves the shaker's cap and arcs up and over into the saucepan.
const CAP = { x: REST_X - 1.2, y: 1.4 }
const grains = () =>
  [0, 0.15, 0.3]
    .map(
      (begin, i) =>
        `<rect x="${CAP.x}" y="${CAP.y}" width="0.35" height="0.35" fill="#FFFFFF" stroke="#B9B3A8" stroke-width="0.08" opacity="0">` +
        `<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" dur="0.45s" begin="${begin}s" repeatCount="indefinite"/>` +
        `<animate attributeName="x" values="${CAP.x};${SAUCEPAN.x + 0.9 - i * 0.7}" dur="0.45s" begin="${begin}s" repeatCount="indefinite"/>` +
        `<animate attributeName="y" values="${CAP.y};-3.6;${SAUCEPAN.y}" keyTimes="0;0.5;1" dur="0.45s" begin="${begin}s" repeatCount="indefinite"/></rect>`,
    )
    .join('')

const love = (s: Slot) =>
  `<g opacity="0">${fade(
    s,
    [
      [HAPPY + 0.1, 1, 'hold'],
      [LENGTH - 0.3, 1],
      [LENGTH, 0],
    ],
    0,
  )}<g>${move(s, [
    // Left of his hat: at the right he is at the drawing's edge.
    [HAPPY + 0.1, xy(REST_X - 2.4, -5.6)],
    [LENGTH, xy(REST_X - 2.8, -8.2), 'out'],
  ])}${heart()}</g></g>`

export const taste: Act = {
  name: 'Taste test',
  length: LENGTH,
  takesLadle: true,
  beats: [
    [1.2, 'sips from the ladle'],
    [2.5, 'thinks it over'],
    [SHAKE + 0.4, 'flicks in some salt'],
    [SIP_2 + 0.7, 'sips again'],
    [HAPPY + 0.3, 'a happy little bounce'],
  ],
  draw: s =>
    during(
      s,
      [[0, LENGTH]],
      during(s, IN_POT, ladleAt(s)) +
        actor(s, {
          length: LENGTH,
          path: [
            [0, xy(REST_X, 0)],
            [HAPPY + 0.1, xy(REST_X, 0)],
            [HAPPY + 0.3, xy(REST_X, -1), 'out'],
            [HAPPY + 0.5, xy(REST_X, 0), 'in'],
            [HAPPY + 0.7, xy(REST_X, -1), 'out'],
            [HAPPY + 0.9, xy(REST_X, 0), 'in'],
          ],
          look: {
            blank: [
              [0.85, 1.75],
              [SIP_2 + 0.45, HAPPY],
            ],
            up: [[1.8, SALT]],
            left: [[SALT, SHAKEN + 0.2]],
            happy: [[HAPPY, LENGTH]],
          },
          front: during(s, [[SALT, SHAKEN + 0.3]], salt(s)),
        }) +
        during(s, LIFTED, ladleAt(s)) +
        during(s, [[SHAKE, SHAKEN]], grains()) +
        love(s),
    ),
}
