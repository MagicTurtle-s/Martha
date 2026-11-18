// Pancake flip. At the range he flips the pancake in the pan with his
// spatula, each flip higher; the third goes up out of sight and never comes
// down. He looks up, waits, shrugs and goes back to the pot.

import { PAN, REST_X } from '../kitchen'
import { actor, armsUp, pancake, question, spatula, walkTime } from '../sprites'
import { during, move, turn, xy, zoom, type Act, type Key, type Slot } from '../timeline'

const AT = 27 // beside the range, the pan at his left (where he cooks in the fire)
const IN = walkTime(REST_X, AT)
const FLIP_1 = IN + 0.6
const FLIP_2 = IN + 1.8
const FLIP_3 = IN + 3.1
const GONE = FLIP_3 + 0.6
const SHRUG = GONE + 2
const DONE = SHRUG + 0.8
const LENGTH = DONE + IN

const PAN_AT = xy(PAN.x, PAN.y - 0.1)

const PATH: Key[] = [
  [0, xy(REST_X, 0)],
  [IN, xy(AT, 0)],
  [SHRUG, xy(AT, 0)],
  [SHRUG + 0.15, xy(AT, -0.6), 'out'],
  [SHRUG + 0.4, xy(AT, 0), 'in'],
  [DONE, xy(AT, 0)],
  [LENGTH, xy(REST_X, 0)],
]

// Up and back into the pan twice, then up and away for good.
const flight = (s: Slot) =>
  move(s, [
    [FLIP_1, PAN_AT],
    [FLIP_1 + 0.3, xy(PAN.x, PAN.y - 2.6), 'out'],
    [FLIP_1 + 0.6, PAN_AT, 'in'],
    [FLIP_2, PAN_AT],
    [FLIP_2 + 0.4, xy(PAN.x, PAN.y - 5.2), 'out'],
    [FLIP_2 + 0.8, PAN_AT, 'in'],
    [FLIP_3, PAN_AT],
    [GONE, xy(PAN.x + 1.5, -13), 'out'],
  ])

// Turning over: squashed to an edge and back, once per flip, faster at the end.
const spin = (s: Slot) =>
  zoom(s, [
    [FLIP_1, '1 1'],
    [FLIP_1 + 0.3, '1 -1'],
    [FLIP_1 + 0.6, '1 1'],
    [FLIP_2, '1 1'],
    [FLIP_2 + 0.4, '1 -1'],
    [FLIP_2 + 0.8, '1 1'],
    [FLIP_3, '1 1'],
    [FLIP_3 + 0.2, '1 -1'],
    [FLIP_3 + 0.4, '1 1'],
    [GONE, '1 -1'],
  ])

// The spatula rests in the pan and flicks up at each flip.
const flick = (s: Slot) =>
  turn(s, [
    [IN, -60],
    [FLIP_1, -60],
    [FLIP_1 + 0.12, -25, 'out'],
    [FLIP_1 + 0.35, -60],
    [FLIP_2, -60],
    [FLIP_2 + 0.12, -15, 'out'],
    [FLIP_2 + 0.4, -60],
    [FLIP_3, -60],
    [FLIP_3 + 0.12, 5, 'out'],
    [FLIP_3 + 0.5, -40],
  ])

export const flip: Act = {
  name: 'Pancake flip',
  length: LENGTH,
  beats: [
    [IN - 0.5, 'walks to the range'],
    [FLIP_1 + 0.3, 'a small flip'],
    [FLIP_2 + 0.4, 'a bigger one'],
    [FLIP_3 + 0.3, 'a huge one'],
    [GONE + 0.8, 'it never comes down'],
    [SHRUG + 0.3, 'shrugs'],
    [DONE + 0.6, 'and moves on'],
  ],
  draw: s =>
    during(
      s,
      [[0, LENGTH]],
      during(s, [[0.8, GONE]], `<g>${flight(s)}<g>${spin(s)}${pancake()}</g></g>`) +
        actor(s, {
          length: LENGTH,
          path: PATH,
          look: {
            up: [[FLIP_3 + 0.2, SHRUG - 0.6]],
            happy: [[SHRUG - 0.6, DONE]],
          },
          walk: [
            [0, IN],
            [DONE, LENGTH],
          ],
          front:
            during(s, [[IN, SHRUG - 0.6]], `<g transform="translate(0.6 2.5)"><g>${flick(s)}${spatula()}</g></g>`) +
            during(s, [[SHRUG - 0.6, DONE - 0.2]], armsUp()) +
            during(s, [[GONE + 0.5, SHRUG - 0.6]], `<g transform="translate(13.4 -8.6)">${question()}</g>`),
        }),
    ),
}
