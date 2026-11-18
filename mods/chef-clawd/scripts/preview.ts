// Writes preview.html: Chef Clawd idle, each act alone with a slider to scrub
// through it, and one whole shuffled prompt, all larger than in the app.
//
//   node --import ./scripts/resolve-ts.mjs scripts/preview.ts [seed]
//     [--without "<act name>"]... [--out <file>]
//
// Run it in the mod's folder; it prints the page's path. --without leaves an
// act out of the page and its shuffle.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { IDLE_W, idleSvg } from '../hooks/art'
import { ACTS as ALL, WORK_W, programme, workingSvg, type Programme } from '../hooks/scene'

const args = process.argv.slice(2)
const flag = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []))
const without = flag('--without')
const unknown = without.filter(name => !ALL.some(act => act.name === name))
if (unknown.length) throw new Error(`no act named ${unknown.join(', ')}; the acts are ${ALL.map(a => a.name).join(', ')}`)
const ACTS = ALL.filter(act => !without.includes(act.name))
const OUT = flag('--out')[0] ?? 'preview.html'

// Same seed, same shuffle, so a page can be made again.
const seed = Number(args.find((a, i) => /^\d+$/.test(a) && !args[i - 1]?.startsWith('--')) ?? Math.floor(Math.random() * 1e6))
const seeded = (a: number) => () => {
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const LEAD = 1.5
const TAIL = 2
const round = (n: number) => Math.round(n * 100) / 100

const alone = (i: number): Programme => ({
  cycle: round(LEAD + ACTS[i].length + TAIL),
  acts: [{ act: ACTS[i], at: LEAD }],
})

const whole = programme(ACTS, seeded(seed))

const figure = (title: string, note: string, source: string, width: number, scale: number, cycle?: number) => `
<figure${cycle ? ` data-cycle="${cycle}"` : ''}>
  <figcaption><strong>${title}</strong> <span>${note}</span></figcaption>
  <div class="band" style="--w:${width * scale}px">${source}</div>
  ${
    cycle
      ? `<div class="controls">
    <button class="play">Pause</button>
    <button class="restart">Restart</button>
    <input type="range" min="0" max="${cycle}" step="0.05" value="0">
    <output>0.0 s</output>
  </div>`
      : ''
  }
</figure>`

// Stills of an act's beats, each its own drawing paused at that moment.
const storyboard = (i: number) => {
  const act = ACTS[i]
  if (!act.beats?.length) return ''
  const source = workingSvg(alone(i))
  return `
<section class="board">
  <h2>${act.name}, beat by beat</h2>
  <div class="frames">${act.beats
    .map(([t, caption]) => `<figure class="still" data-t="${LEAD + t}"><div class="band">${source}</div><figcaption>${t.toFixed(1)} s: ${caption}</figcaption></figure>`)
    .join('')}</div>
</section>`
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chef Clawd preview</title>
<style>
  :root { color-scheme: light; --bg: #F5F4F1; --card: #FCFCFB; --edge: #E6E3DD; --ink: #1F1E1D; --muted: #6B6862; }
  body { margin: 0; padding: 24px 16px 48px; background: var(--bg); color: var(--ink);
    font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1120px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.lede { margin: 0 0 24px; color: var(--muted); }
  figure { margin: 0 0 28px; }
  figcaption { margin-bottom: 8px; }
  figcaption span { color: var(--muted); margin-left: 6px; }
  .band { background: var(--card); border: 6px solid var(--edge); border-radius: 14px; padding: 10px 16px;
    display: flex; justify-content: flex-end; overflow-x: auto; }
  .band svg { width: var(--w); height: auto; max-width: 100%; flex: none; }
  .controls { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
  .controls input { flex: 1 1 240px; }
  .controls output { font-variant-numeric: tabular-nums; min-width: 5em; color: var(--muted); }
  h2 { font-size: 16px; margin: 0 0 10px; }
  .board { margin: 0 0 28px; display: none; }
  .js .board { display: block; }
  .frames { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; }
  .still { margin: 0; }
  .still .band { border-width: 3px; border-radius: 8px; padding: 4px 6px; }
  .still .band svg { width: 100%; }
  .still figcaption { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
  button { font: inherit; padding: 4px 12px; border-radius: 8px; border: 1px solid var(--edge); background: #fff; cursor: pointer; }
</style>
</head>
<body>
<main>
  <h1>Chef Clawd preview</h1>
  <p class="lede">Shown three times the size he is in the app, except the last, which is actual size. Drag a slider to step through an act; Restart plays it from the top. Shuffle seed ${seed}.${without.length ? ` Left out: ${without.join(', ')}.` : ''}</p>
  ${figure('Idle', 'between prompts', idleSvg(), IDLE_W, 3)}
  ${ACTS.map((act, i) => figure(act.name, `${act.length.toFixed(1)} s, with ${LEAD} s of stirring before it`, workingSvg(alone(i)), WORK_W, 3, alone(i).cycle)).join('')}
  ${ACTS.map((_, i) => storyboard(i)).join('')}
  ${figure('A whole prompt, actual size', `every act once, shuffled, with rests between (${whole.cycle} s, then it repeats)`, workingSvg(whole), WORK_W, 1, whole.cycle)}
</main>
<script>
document.body.classList.add('js')
// ?board=N shows only act N's storyboard, two stills a row, for a screenshot.
const only = new URLSearchParams(location.search).get('board')
if (only !== null) {
  for (const el of document.querySelectorAll('main > *')) el.style.display = 'none'
  const board = document.querySelectorAll('.board')[Number(only)]
  board.style.display = ''
  board.querySelector('.frames').style.gridTemplateColumns = 'repeat(2, 1fr)'
}
for (const still of document.querySelectorAll('.still')) {
  const svg = still.querySelector('svg')
  svg.pauseAnimations()
  svg.setCurrentTime(Number(still.dataset.t))
}
for (const fig of document.querySelectorAll('figure[data-cycle]')) {
  const svg = fig.querySelector('svg')
  const cycle = Number(fig.dataset.cycle)
  const slider = fig.querySelector('input')
  const label = fig.querySelector('output')
  const play = fig.querySelector('.play')
  let playing = true
  const set = on => {
    playing = on
    on ? svg.unpauseAnimations() : svg.pauseAnimations()
    play.textContent = on ? 'Pause' : 'Play'
  }
  play.onclick = () => set(!playing)
  fig.querySelector('.restart').onclick = () => { svg.setCurrentTime(0); set(true) }
  slider.oninput = () => { set(false); svg.setCurrentTime(Number(slider.value)) }
  const tick = () => {
    const t = svg.getCurrentTime() % cycle
    if (playing) slider.value = t
    label.textContent = t.toFixed(1) + ' s'
    requestAnimationFrame(tick)
  }
  tick()
}
</script>
</body>
</html>
`

const out = resolve(OUT)
writeFileSync(out, html)
console.log(out)
