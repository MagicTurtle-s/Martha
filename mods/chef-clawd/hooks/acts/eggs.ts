// Egg juggling. Beside the counter he juggles three eggs, catches two, and
// the third drops onto the counter, wobbles and does not break. He lets out
// a long breath and goes back to the pot.

import { REST_X } from '../kitchen'
import { SMOKE, actor, egg, walkTime } from '../sprites'
import { during, fade, move, turn, xy, type Act, type Key, type Slot } from '../timeline'

const AT = 15 // the counter's free end at his left
const IN = walkTime(REST_X, AT)
const JUGGLE = IN + 0.3
const CATCH = JUGGLE + 4
const LAND = CATCH + 0.8
const STILL = LAND + 0.9
const DONE = STILL + 1
const LENGTH = DONE + IN

const SPOT = { x: 13, y: 1 } // on the counter, between the board and the salt

const PATH: Key[] = [
  [0, xy(REST_X, 0)],
  [IN, xy(AT, 0)],
  [STILL + 0.1, xy(AT, 0)],
  [STILL + 0.4, xy(AT, 0.4), 'out'],
  [STILL + 0.8, xy(AT, 0), 'inOut'],
  [DONE, xy(AT, 0)],
  [LENGTH, xy(REST_X, 0)],
]

// Round and round between his paws (his units), each egg a third of a
// throw behind the last.
const ARC = '1 2.6;2.5 -1.6;6.5 -4.4;10.5 -1.6;12 2.6;10 1;6.5 0.6;3 1;1 2.6'
const juggling = () =>
  [0, -0.5, -1]
    .map(
      begin =>
        `<g><animateTransform attributeName="transform" type="translate" values="${ARC}" dur="1.5s" begin="${begin}s" repeatCount="indefinite"/>${egg()}</g>`,
    )
    .join('')

const caught = () => `<g transform="translate(1 2.6)">${egg()}</g><g transform="translate(12 2.6)">${egg()}</g>`

// The third egg: down onto the counter, a bounce, a wobble, still.
const dropped = (s: Slot) =>
  `<g opacity="0">${fade(
    s,
    [
      [CATCH, 1, 'hold'],
      [LENGTH - 0.4, 1],
      [LENGTH, 0],
    ],
    0,
  )}<g>${move(s, [
    [CATCH, xy(AT + 6.5, -4.4)],
    [CATCH + 0.3, xy(AT + 2.5, -5.6), 'out'],
    [LAND, xy(SPOT.x, SPOT.y), 'in'],
    [LAND + 0.15, xy(SPOT.x, SPOT.y - 0.6), 'out'],
    [LAND + 0.3, xy(SPOT.x, SPOT.y), 'in'],
  ])}<g>${turn(s, [
    [LAND + 0.3, 0],
    [LAND + 0.45, 14],
    [LAND + 0.6, -11],
    [LAND + 0.72, 7],
    [LAND + 0.82, -3],
    [STILL, 0],
  ])}${egg()}</g></g></g>`

// The long breath out, a little cloud off his face.
const sigh = (s: Slot) =>
  `<g opacity="0">${fade(
    s,
    [
      [STILL + 0.1, 0.8, 'hold'],
      [STILL + 0.8, 0],
    ],
    0,
  )}<g>${move(s, [
    [STILL + 0.1, xy(12.6, 1.6)],
    [STILL + 0.8, xy(15.4, 0.8), 'out'],
  ])}<circle r="0.8" fill="${SMOKE}" opacity="0.6"/></g></g>`

export const eggs: Act = {
  name: 'Egg juggling',
  length: LENGTH,
  beats: [
    [IN - 0.6, 'walks to the counter'],
    [JUGGLE + 0.9, 'juggles three eggs'],
    [JUGGLE + 2.4, 'round and round'],
    [CATCH + 0.4, 'catches two'],
    [LAND + 0.5, 'the third lands, wobbles'],
    [STILL + 0.4, 'breathes out'],
  ],
  draw: s =>
    during(
      s,
      [[0, LENGTH]],
      actor(s, {
        length: LENGTH,
        path: PATH,
        look: {
          up: [[JUGGLE, CATCH]],
          wide: [[CATCH, CATCH + 0.3]],
          left: [[CATCH + 0.3, STILL]],
          blank: [[STILL, DONE - 0.2]],
        },
        walk: [
          [0, IN],
          [DONE, LENGTH],
        ],
        front: during(s, [[JUGGLE, CATCH]], juggling()) + during(s, [[CATCH, DONE - 0.2]], caught()) + sigh(s),
      }) +
        // In front of him, so it does not pass behind his hat as it falls.
        dropped(s),
    ),
}
