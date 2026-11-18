// The long recipe. At the counter's far end he unrolls a recipe that drops to
// the floor and runs off along the open floor, reads it top to bottom, nods,
// rolls it back up and goes back to the pot.

import { REST_X } from '../kitchen'
import { actor, walkTime } from '../sprites'
import { during, move, xy, zoom, type Act, type Key, type Slot } from '../timeline'

const AT = 1 // in front of the counter's left end, the open floor at his left
const IN = walkTime(REST_X, AT)
const OUT = IN + 0.3 // the roll in his hand
const DROP = OUT + 0.6 // hanging to the floor
const RUN = DROP + 0.7 // and off along it
const READ = RUN + 2.8
const NOD = READ + 0.6
const FOLD = NOD + 1
const DONE = FOLD + 0.3
const LENGTH = DONE + IN

const PAPER = '#F6EFD9'
const PAPER_EDGE = '#DCCFA8'
const INK = '#A79D86'

const PATH: Key[] = [
  [0, xy(REST_X, 0)],
  [IN, xy(AT, 0)],
  [READ, xy(AT, 0)],
  [READ + 0.15, xy(AT, 0.4), 'out'],
  [READ + 0.3, xy(AT, 0), 'in'],
  [READ + 0.45, xy(AT, 0.4), 'out'],
  [READ + 0.6, xy(AT, 0), 'in'],
  [DONE, xy(AT, 0)],
  [LENGTH, xy(REST_X, 0)],
]

// Scaled from one edge: `x y` is the fixed edge, the keys say how far out.
const unroll = (s: Slot, x: number, y: number, keys: Key[], inner: string) =>
  `<g transform="translate(${xy(x, y)})"><g>${zoom(s, keys)}<g transform="translate(${xy(-x, -y)})">${inner}</g></g></g>`

const lines = (x: number, w: number, ys: number[]) => ys.map(y => `<rect x="${x}" y="${y}" width="${w}" height="0.15" fill="${INK}"/>`).join('')

// In his hand at the left (his units): the roll, the sheet hanging from it,
// and the length lying along the floor with its loose end rolled.
const scroll = (s: Slot) =>
  unroll(
    s,
    0,
    3,
    [
      [IN, 0.01],
      [OUT, 1, 'out'],
      [FOLD, 1],
      [DONE, 0.01, 'in'],
    ],
    unroll(
      s,
      -1.6,
      6.6,
      [
        [DROP, '0.01 1'],
        [RUN, '1 1', 'out'],
        [NOD, '1 1'],
        [NOD + 0.5, '0.01 1', 'in'],
      ],
      `<rect x="-15" y="6.6" width="13.4" height="0.45" fill="${PAPER}" stroke="${PAPER_EDGE}" stroke-width="0.12"/>` +
        lines(-14, 11.6, [6.75]),
    ) +
      unroll(
        s,
        0,
        2.6,
        [
          [OUT, '1 0.01'],
          [DROP, '1 1', 'out'],
          [NOD + 0.5, '1 1'],
          [FOLD, '1 0.01', 'in'],
        ],
        `<rect x="-1.4" y="2.6" width="2.8" height="4.4" fill="${PAPER}" stroke="${PAPER_EDGE}" stroke-width="0.12"/>` +
          lines(-0.9, 1.8, [3.2, 3.8, 4.4, 5, 5.6, 6.2]),
      ) +
      `<rect x="-1.7" y="2" width="3.4" height="0.8" rx="0.3" fill="#E9DDBB" stroke="${PAPER_EDGE}" stroke-width="0.12"/>`,
  ) +
  during(
    s,
    [[DROP, NOD + 0.5]],
    `<g>${move(s, [
      [DROP, xy(-1.6, 6.3)],
      [RUN, xy(-15.4, 6.3), 'out'],
      [NOD, xy(-15.4, 6.3)],
      [NOD + 0.5, xy(-1.6, 6.3), 'in'],
    ])}<rect x="0" y="0" width="1" height="0.9" rx="0.4" fill="#E9DDBB" stroke="${PAPER_EDGE}" stroke-width="0.12"/></g>`,
  )

export const recipe: Act = {
  name: 'The long recipe',
  length: LENGTH,
  beats: [
    [OUT, 'pulls out a recipe'],
    [DROP + 0.2, 'it unrolls to the floor'],
    [RUN + 0.6, 'reads it top to bottom'],
    [READ - 0.5, 'all the way along'],
    [READ + 0.15, 'nods'],
    [NOD + 0.6, 'rolls it back up'],
  ],
  draw: s =>
    during(
      s,
      [[0, LENGTH]],
      actor(s, {
        length: LENGTH,
        path: PATH,
        look: {
          down: [
            [OUT, RUN],
            [RUN + 1.4, READ - 0.9],
          ],
          left: [
            [RUN, RUN + 0.5],
            [READ - 0.9, READ],
          ],
          happy: [[READ, NOD]],
        },
        walk: [
          [0, IN],
          [DONE, LENGTH],
        ],
        front: during(s, [[IN, DONE]], scroll(s)),
      }),
    ),
}
