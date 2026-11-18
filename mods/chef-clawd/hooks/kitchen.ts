// The kitchen behind Chef Clawd while a prompt runs, in art.ts units: a shelf
// over open floor, a counter, and the range with its pan and saucepan. The
// range and his resting place are at the right end, where he stands when
// idle, so the band does not jump when work starts. The counter's left end
// is x 0; the open floor runs left of it, to LEFT.

import { HAT, HAT_EDGE, POT, POT_EDGE, SOUP, SOUP_DARK, STEEL, rects } from './art'

export const WIDTH = 84
export const LEFT = -31
export const VIEW = `${LEFT} -9 ${WIDTH} 17`

// His body's corner while he stirs the saucepan, as in the idle drawing's
// place: 14 units in from the right edge.
export const REST_X = LEFT + WIDTH - 14

// The frying pan's middle, on the range's left burner.
export const PAN = { x: 25.5, y: 0.2 }

// Where the acts reach into the kitchen.
export const COUNTER_TOP = 1
export const CARROT = { x: 5.5, y: -0.05, w: 3.2, h: 0.45 }
export const SAUCEPAN = { x: 33.3, y: -1.7 } // the middle of its rim
export const OVEN = { x: 22, y: 2.9, w: 14, h: 3.7 } // the door
export const TIMER = { x: 16.2, y: -0.5, w: 1.9, h: 1.5 }

export const WALL = '#F3F0EA'
const GROUT = '#E7E2D9'
const WOOD = '#C79A6B'
const WOOD_DARK = '#A97C4F'
const CABINET = '#EDE7DC'
const CABINET_EDGE = '#D9D1C3'
const KNOB = '#9C9387'
const RANGE_BODY = '#DAD7D2'
const RANGE_PANEL = '#C6C2BC'
const RANGE_TOP = '#3B3836'
const DOOR = '#B7B2AB'
const GLASS = '#403C3A'
const HANDLE = '#7D7A75'
const BOARD = '#E2C091'
export const CARROT_ORANGE = '#EE8A3C'
const LEAF = '#6FA34B'
const TIMER_RED = '#E2574C'

const backsplash = () =>
  rects([[0, -2.6, 38, 3.6]], WALL) +
  rects(
    [
      [0, -0.9, 38, 0.15],
      [6, -2.6, 0.15, 1.7],
      [14, -2.6, 0.15, 1.7],
      [22, -2.6, 0.15, 1.7],
      [30, -2.6, 0.15, 1.7],
      [2, -0.75, 0.15, 1.75],
      [10, -0.75, 0.15, 1.75],
      [18, -0.75, 0.15, 1.75],
      [26, -0.75, 0.15, 1.75],
      [34, -0.75, 0.15, 1.75],
    ],
    GROUT,
  )

export const carrot = () => rects([[CARROT.x, CARROT.y, CARROT.w, CARROT.h]], CARROT_ORANGE)
export const carrotTop = () =>
  rects(
    [
      [CARROT.x + CARROT.w, -0.2, 0.9, 0.3],
      [CARROT.x + CARROT.w + 0.2, -0.45, 0.5, 0.3],
    ],
    LEAF,
  )

export const timer = () =>
  rects([[TIMER.x, TIMER.y, TIMER.w, TIMER.h]], TIMER_RED) + rects([[TIMER.x + 0.4, TIMER.y + 0.3, 1.1, 0.9]], HAT)

// The oven door, closed: glass in a frame, the handle across its top.
export const ovenDoor = () =>
  rects([[OVEN.x, OVEN.y, OVEN.w, OVEN.h]], DOOR) +
  rects([[OVEN.x + 1.5, OVEN.y + 1, OVEN.w - 3, 1.9]], GLASS) +
  rects([[OVEN.x + 1, OVEN.y + 0.3, OVEN.w - 2, 0.35]], HANDLE)

// Cabinets under a butcher-block top; on it a cutting board with a carrot,
// the salt and the kitchen timer.
const counter = () =>
  rects([[1.5, 1.8, 17, 5.2]], CABINET) +
  rects(
    [
      [2.4, 2.6, 7.4, 3.8],
      [10.2, 2.6, 7.4, 3.8],
    ],
    CABINET_EDGE,
  ) +
  rects(
    [
      [2.7, 2.9, 6.8, 3.2],
      [10.5, 2.9, 6.8, 3.2],
    ],
    CABINET,
  ) +
  rects(
    [
      [8.6, 4.1, 0.5, 0.8],
      [10.9, 4.1, 0.5, 0.8],
    ],
    KNOB,
  ) +
  rects([[1, 1, 18, 0.8]], WOOD) +
  rects([[1, 1.6, 18, 0.25]], WOOD_DARK) +
  rects([[4, 0.4, 8, 0.6]], BOARD) +
  rects([[4, 0.85, 8, 0.15]], WOOD_DARK) +
  carrot() +
  carrotTop() +
  rects([[14, -0.7, 1.1, 1.7]], CABINET_EDGE) +
  rects([[14.15, -0.55, 0.8, 1.4]], HAT) +
  rects([[14, -1.1, 1.1, 0.4]], STEEL) +
  timer()

// The range: burners on top, knobs on the panel, the oven door below.
const range = () =>
  rects([[21, 2.4, 16, 4.6]], RANGE_BODY) +
  rects([[21, 1.3, 16, 1.1]], RANGE_PANEL) +
  rects(
    [
      [22.5, 1.5, 0.7, 0.7],
      [25, 1.5, 0.7, 0.7],
      [32.3, 1.5, 0.7, 0.7],
      [34.8, 1.5, 0.7, 0.7],
    ],
    RANGE_TOP,
  ) +
  ovenDoor() +
  rects([[21, 0.8, 16, 0.5]], RANGE_TOP) +
  rects(
    [
      [PAN.x - 3, PAN.y, 6, 0.6],
      [PAN.x - 5.9, PAN.y + 0.15, 3, 0.3],
    ],
    POT,
  ) +
  saucepan()

// The saucepan on the right burner, its lid off: he stirs it while he rests.
// Its mouth and the soup show above the front, which is drawn again over a
// ladle left leaning in it.
const PAN_BODY: [number, number, number, number] = [31, -1.2, 4.6, 2]
export const saucepanFront = () => rects([PAN_BODY], POT_EDGE)
const saucepan = () =>
  rects([[30.8, -1.9, 5, 0.7]], POT) +
  rects([[31.2, -1.75, 4.2, 0.45]], SOUP) +
  saucepanFront() +
  rects([[35.6, -0.9, 1.3, 0.3]], POT_EDGE)

const bubble = (cx: number, begin: number) =>
  `<circle cx="${cx}" cy="-1.5" r="0.3" fill="${SOUP_DARK}" stroke="#A9D18E" stroke-width="0.12" opacity="0">` +
  `<animate attributeName="opacity" values="0;1;0" dur="1.4s" begin="${begin}s" repeatCount="indefinite"/>` +
  `<animate attributeName="cy" values="-1.45;-2.1" dur="1.4s" begin="${begin}s" repeatCount="indefinite"/>` +
  `</circle>`

const steam = (x: number, begin: number) =>
  `<rect x="${x}" y="0" width="0.6" height="1.4" fill="${HAT_EDGE}" opacity="0">` +
  `<animate attributeName="opacity" values="0;0.8;0" dur="2.2s" begin="${begin}s" repeatCount="indefinite"/>` +
  `<animate attributeName="y" values="-3;-7.5" dur="2.2s" begin="${begin}s" repeatCount="indefinite"/>` +
  `</rect>`

// The saucepan simmering: bubbles on the soup and steam off it.
export const simmer = () =>
  bubble(32, 0) + bubble(34.6, 0.5) + bubble(33.2, 0.95) + steam(31.6, 0) + steam(34.2, 0.8) + steam(32.8, 1.5)

// A shelf of jars over the open floor left of the counter.
const shelf = () =>
  rects(
    [
      [-21, -4.9, 0.5, 1.1],
      [-9.5, -4.9, 0.5, 1.1],
    ],
    WOOD_DARK,
  ) +
  rects([[-22, -5.4, 14, 0.5]], WOOD) +
  rects([[-20, -7.3, 2.2, 1.9]], '#CFE3D3') +
  rects([[-16.4, -6.9, 2, 1.5]], '#F2D8B4') +
  rects([[-13, -7.8, 2.4, 2.4]], '#E9C9C1') +
  rects(
    [
      [-20, -7.7, 2.2, 0.4],
      [-16.4, -7.3, 2, 0.4],
      [-13, -8.2, 2.4, 0.4],
    ],
    STEEL,
  )

export const kitchen = () => backsplash() + counter() + range() + shelf()
