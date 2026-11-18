// Chef Clawd as SVG, in pixel units (U px each). Clawd's right hand is the
// viewer's left, so the ladle sits on the left, toward the range.

export const U = 4

export const CLAY = '#D97757'
export const EYE = '#1F1E1D'
export const HAT = '#FFFFFF'
export const HAT_EDGE = '#B9B3A8'
export const STEEL = '#8E949C'
export const STEEL_DARK = '#5F656D'
export const POT = '#2E2C2B'
export const POT_EDGE = '#57534F'
export const SOUP = '#7BAE5A'
export const SOUP_DARK = '#5E8F43'

export type Rect = [x: number, y: number, w: number, h: number]

export const rects = (list: Rect[], fill: string, grow = 0) =>
  list
    .map(
      ([x, y, w, h]) =>
        `<rect x="${x - grow}" y="${y - grow}" width="${w + grow * 2}" height="${h + grow * 2}" fill="${fill}"/>`,
    )
    .join('')

// The tall, puffy ("broccoli") toque: outline layer, then the white.
export const TOQUE: Rect[] = [
  [3, -2, 7, 2],
  [2, -6, 9, 4],
  [1, -5.5, 1, 2.5],
  [11, -5.5, 1, 2.5],
  [2, -7, 2.5, 1],
  [5, -8, 3, 2],
  [8.5, -7, 2.5, 1],
]
export const hat = () =>
  rects(TOQUE, HAT_EDGE, 0.35) +
  rects(TOQUE, HAT) +
  rects([[3, -2.4, 7, 0.3]], HAT_EDGE)

export const body = () =>
  rects(
    [
      [2, 0, 9, 5],
      [0, 2, 2, 1],
      [11, 2, 2, 1],
      [3, 5, 1, 2],
      [5, 5, 1, 2],
      [7, 5, 1, 2],
      [9, 5, 1, 2],
    ],
    CLAY,
  ) + rects([[4, 1.5, 1, 1], [8, 1.5, 1, 1]], EYE)

// Ladle in hand-local units: origin at the hand, handle pointing up (-y).
export const ladle = () =>
  `<rect x="-0.3" y="-6.2" width="0.6" height="6.7" fill="${STEEL}"/>` +
  `<rect x="-1.3" y="-8" width="2.6" height="1.9" rx="0.8" fill="${STEEL_DARK}"/>` +
  `<rect x="-1" y="-7.8" width="2" height="1.2" rx="0.5" fill="${STEEL}"/>`

export const HAND = '0.6 2.5'

export const svg = (viewBox: string, width: number, height: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" shape-rendering="crispEdges">${inner}</svg>`

export const IDLE_W = 17 * U
export const IDLE_H = 17 * U

export const idleSvg = () =>
  svg(
    '-3 -9 17 17',
    IDLE_W,
    IDLE_H,
    `<g transform="translate(${HAND}) rotate(-18)">${ladle()}</g>` + body() + hat(),
  )

// When the drawing appears he holds the ladle as in the idle drawing for a
// beat, then lowers it to the saucepan on the range and the stirring starts.
// All times are from the moment the drawing appears.
const WAIT = 0.15
const DIP = 0.35
const STIR_AT = WAIT + DIP

// Stir for the first half of each cycle, rest for the second: "occasionally".
export const STIR = `dur="3.6s" begin="${STIR_AT}s" repeatCount="indefinite" keyTimes="0;0.1;0.2;0.3;0.4;0.5;1"`
// The ladle's angle about his hand with its bowl in the saucepan.
export const BASE = -58

// The ladle leaves the idle pose (-18) for the saucepan.
export const dip = () =>
  `<animateTransform attributeName="transform" type="rotate" begin="${WAIT}s" dur="${DIP}s" fill="freeze" ` +
  `values="-18;${BASE}" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.6 1"/>`
