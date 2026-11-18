// The drawing while a prompt runs: the kitchen, the saucepan on the range he
// stirs while resting, and the acts in a shuffled programme that loops.

import { BASE, HAND, STIR, U, body, dip, ladle, svg } from './art'
import { chop } from './acts/chop'
import { eggs } from './acts/eggs'
import { fire } from './acts/fire'
import { ovenCheck } from './acts/oven'
import { flip } from './acts/pancake'
import { recipe } from './acts/recipe'
import { taste } from './acts/taste'
import { REST_X, VIEW, WIDTH, kitchen, saucepanFront, simmer } from './kitchen'
import { defs, toque } from './sprites'
import { during, without, type Act, type Slot, type Window } from './timeline'

export const ACTS: Act[] = [fire, flip, chop, taste, recipe, ovenCheck, eggs]

export const WORK_W = WIDTH * U
export const WORK_H = 17 * U

export type Programme = { cycle: number; acts: { act: Act; at: number }[] }

const REST_MIN = 4
const REST_MAX = 8
const round = (n: number) => Math.round(n * 100) / 100

// Each act once, in an order shuffled for this prompt, after a rest of 4 to 8
// seconds. The programme then repeats, so no act comes round twice before
// all have played.
export const programme = (acts: Act[] = ACTS, random: () => number = Math.random): Programme => {
  const order = [...acts]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  let t = 0
  const placed = order.map(act => {
    t = round(t + REST_MIN + random() * (REST_MAX - REST_MIN))
    const at = t
    t = round(t + act.length)
    return { act, at }
  })
  return { cycle: placed.length ? t : REST_MAX, acts: placed }
}

// Left in the saucepan while he is off at an act: the bowl in the soup, the
// handle out over the rim.
const leaning = () => `<g transform="translate(38.4 -4.4) rotate(-125)">${ladle()}</g>` + saucepanFront()

export const workingSvg = (p: Programme = programme()) => {
  const whole: Slot = { at: 0, cycle: p.cycle }
  const busy: Window[] = p.acts.map(({ act, at }) => [at, at + act.length])
  const resting = without([[0, p.cycle]], busy)
  const ladleInPot = p.acts.filter(({ act }) => !act.takesLadle).map(({ act, at }): Window => [at, at + act.length])
  return svg(
    VIEW,
    WORK_W,
    WORK_H,
    defs() +
      kitchen() +
      simmer() +
      during(whole, ladleInPot, leaning()) +
      `<g transform="translate(${REST_X} 0)">` +
      during(
        whole,
        resting,
        // Over the saucepan: he stands in front of the range and reaches up to it.
        `<g transform="translate(${HAND})"><g transform="rotate(-18)">` +
          dip() +
          `<animateTransform attributeName="transform" type="rotate" ${STIR} values="${BASE};${BASE - 7};${BASE + 5};${BASE - 7};${BASE + 5};${BASE};${BASE}"/>` +
          ladle() +
          `</g></g>` +
          `<g><animateTransform attributeName="transform" type="translate" ${STIR} values="0 0;-0.4 0.2;0 0;-0.4 0.2;0 0;0 0;0 0"/>` +
          body() +
          toque() +
          `</g>`,
      ) +
      `</g>` +
      p.acts.map(({ act, at }) => act.draw({ at, cycle: p.cycle })).join(''),
  )
}
