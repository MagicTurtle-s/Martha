// Renders an act to a looping GIF: the act played alone, as on the preview
// page (stirring, the act, a rest), seeked frame by frame in headless Chrome
// over the DevTools protocol and put together by ffmpeg.
//
//   node --import ./scripts/resolve-ts.mjs scripts/gif.ts "<act name>"
//     [--theme light|dark] [--scale 2] [--fps 20] [--out <file.gif>]
//   node --import ./scripts/resolve-ts.mjs scripts/gif.ts --all --out-dir <folder>
//     [--scale 2] [--fps 20]
//
// --all renders every act in both themes as <act-name>-<theme>.gif, and drops
// a GIF over 3 MB to 15 fps. --frames <folder> is where the PNG frames go (the
// system temp folder by default). Needs Chrome or Edge (or CHROME=<path>) and
// ffmpeg on the PATH (or FFMPEG=<path>).

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { STIR } from '../hooks/art'
import { ACTS, WORK_H, WORK_W, workingSvg, type Programme } from '../hooks/scene'
import type { Act } from '../hooks/timeline'

const args = process.argv.slice(2)
const VALUED = ['--theme', '--scale', '--fps', '--out', '--out-dir', '--frames']
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const positional = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]))

// The band behind him: the desktop app's light background (register.tsx's
// APP_BG) or GitHub's dark one.
const THEMES = { light: '#FCFCFB', dark: '#0d1117' }
type Theme = keyof typeof THEMES

// As on the preview page: stirring before the act and a rest after it.
const LEAD = 1.5
const TAIL = 2
const round = (n: number) => Math.round(n * 100) / 100
const alone = (act: Act): Programme => ({ cycle: round(LEAD + act.length + TAIL), acts: [{ act, at: LEAD }] })

// The ladle lowers to the saucepan once, when the drawing appears; the GIF
// starts when the stirring does (art.ts), so it loops without that.
const START = Number(/begin="([\d.]+)s"/.exec(STIR)?.[1])
const STIR_PERIOD = Number(/dur="([\d.]+)s"/.exec(STIR)?.[1])

// The GIF ends on a whole stir, so its last frame runs into its first without a
// jump. The cut falls in the rest after the act and before the next act would
// begin, so the act always plays whole; failing that, the act's own loop end.
const end = (act: Act) => {
  const { cycle } = alone(act)
  const after = LEAD + act.length + 0.25
  const before = cycle + LEAD - 0.25
  for (let k = 1; START + k * STIR_PERIOD <= before; k++) {
    const t = round(START + k * STIR_PERIOD)
    if (t >= after) return t
  }
  return cycle
}

const LIMIT = 3 * 1024 * 1024
const FALLBACK_FPS = 15

const kebab = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const number = (name: string, fallback: number) => {
  const v = Number(flag(name) ?? fallback)
  if (!(v > 0)) throw new Error(`${name} wants a positive number`)
  return v
}
const scale = number('--scale', 2)
const fps = number('--fps', 20)
const W = Math.round(WORK_W * scale)
const H = Math.round(WORK_H * scale)
const FRAMES = resolve(flag('--frames') ?? join(tmpdir(), 'chef-clawd-gif'))

const findChrome = () => {
  const found = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find(p => p && existsSync(p))
  if (!found) throw new Error('no Chrome or Edge found; set CHROME to its path')
  return found
}
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'

const page = (act: Act, theme: Theme) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; padding: 0; overflow: hidden; background: ${THEMES[theme]}; }
svg { display: block; width: ${W}px; height: ${H}px; }
</style></head><body>${workingSvg(alone(act))}</body></html>
`

// The DevTools protocol over Node's own WebSocket.
type Send = (method: string, params?: object, sessionId?: string) => Promise<any>
const connect = (url: string) =>
  new Promise<{ send: Send; close: () => void }>((ok, fail) => {
    const ws = new WebSocket(url)
    const waiting = new Map<number, [(v: any) => void, (e: Error) => void]>()
    let next = 0
    ws.onmessage = e => {
      const m = JSON.parse(String(e.data))
      const w = m.id !== undefined ? waiting.get(m.id) : undefined
      if (!w) return
      waiting.delete(m.id)
      if (m.error) w[1](new Error(`${m.error.message} (${m.error.code})`))
      else w[0](m.result)
    }
    ws.onerror = () => fail(new Error(`could not connect to ${url}`))
    ws.onclose = () => {
      for (const [, fail] of waiting.values()) fail(new Error('the browser closed the connection'))
      waiting.clear()
    }
    ws.onopen = () =>
      ok({
        send: (method, params = {}, sessionId) =>
          new Promise((res, rej) => {
            const id = ++next
            waiting.set(id, [res, rej])
            ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
          }),
        close: () => ws.close(),
      })
  })

const freePort = () =>
  new Promise<number>((ok, fail) => {
    const server = createServer()
    server.on('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      server.close(() => ok(port))
    })
  })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Browser = { send: Send; session: string; quit: () => Promise<void> }

const launch = async (): Promise<Browser> => {
  const port = await freePort()
  const profile = join(FRAMES, `chrome-profile-${process.pid}`)
  mkdirSync(profile, { recursive: true })
  const proc: ChildProcess = spawn(
    findChrome(),
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${W},${H}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  const exited = new Promise<void>(r => proc.once('exit', () => r()))

  let wsUrl: string | undefined
  for (let tries = 0; !wsUrl && tries < 100; tries++) {
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl
    } catch {
      await sleep(150)
    }
  }
  if (!wsUrl) {
    proc.kill()
    throw new Error('Chrome did not open its DevTools port')
  }
  const { send, close } = await connect(wsUrl)
  const { targetInfos } = await send('Target.getTargets')
  const target = targetInfos.find((t: any) => t.type === 'page')?.targetId ?? (await send('Target.createTarget', { url: 'about:blank' })).targetId
  const { sessionId } = await send('Target.attachToTarget', { targetId: target, flatten: true })
  await send('Page.enable', {}, sessionId)
  await send('Page.bringToFront', {}, sessionId)
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId)

  const quit = async () => {
    await send('Browser.close').catch(() => {})
    close()
    await Promise.race([exited, sleep(5000)])
    if (proc.exitCode === null) proc.kill()
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
  }
  return { send, session: sessionId, quit }
}

// Pauses the drawing at `t` and waits for it to be painted.
const seek = (t: number) => `new Promise(done => {
  const svg = document.querySelector('svg')
  svg.pauseAnimations()
  svg.setCurrentTime(${t})
  requestAnimationFrame(() => requestAnimationFrame(() => done(svg.getCurrentTime())))
})`

const render = async (b: Browser, act: Act, theme: Theme, rate: number, out: string) => {
  const dir = join(FRAMES, kebab(act.name), theme)
  mkdirSync(dir, { recursive: true })
  for (const f of readdirSync(dir)) if (/^frame_\d+\.png$/.test(f)) rmSync(join(dir, f))
  const html = join(dir, 'page.html')
  writeFileSync(html, page(act, theme))

  await b.send('Page.navigate', { url: pathToFileURL(html).href }, b.session)
  for (let tries = 0; ; tries++) {
    const { result } = await b.send(
      'Runtime.evaluate',
      { expression: `document.readyState === 'complete' && !!document.querySelector('svg')`, returnByValue: true },
      b.session,
    )
    if (result.value) break
    if (tries > 100) throw new Error('the page did not load')
    await sleep(50)
  }

  // From the first stir to the end of a whole stir after the act, the end not
  // included: the next frame is the first again.
  const count = Math.round((end(act) - START) * rate)
  for (let i = 0; i < count; i++) {
    const t = Math.round((START + i / rate) * 10000) / 10000
    await b.send('Runtime.evaluate', { expression: seek(t), awaitPromise: true, returnByValue: true }, b.session)
    const { data } = await b.send(
      'Page.captureScreenshot',
      { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 }, fromSurface: true },
      b.session,
    )
    writeFileSync(join(dir, `frame_${String(i + 1).padStart(4, '0')}.png`), Buffer.from(data, 'base64'))
  }

  mkdirSync(resolve(out, '..'), { recursive: true })
  const ff = spawnSync(
    FFMPEG,
    [
      '-y',
      '-v',
      'error',
      '-framerate',
      String(rate),
      '-i',
      join(dir, 'frame_%04d.png'),
      '-vf',
      'split[a][b];[a]palettegen=max_colors=64:stats_mode=full[p];[b][p]paletteuse=dither=none',
      '-loop',
      '0',
      out,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  )
  if (ff.error) throw new Error(`could not run ffmpeg (${ff.error.message}); set FFMPEG to its path`)
  if (ff.status !== 0) throw new Error(`ffmpeg failed with status ${ff.status}`)
  const size = statSync(out).size
  console.log(`${out}  ${Math.round(size / 1024)} KB  ${count} frames at ${rate} fps  (frames in ${dir})`)
  return size
}

const theme = (flag('--theme') ?? 'light') as Theme
if (!(theme in THEMES)) throw new Error(`--theme is light or dark, not ${theme}`)
if (!(START > 0 && STIR_PERIOD > 0)) throw new Error('could not read when and how often the stirring repeats from art.ts')

const browser = await launch()
try {
  if (args.includes('--all')) {
    const dir = resolve(flag('--out-dir') ?? '.')
    for (const act of ACTS) {
      for (const t of Object.keys(THEMES) as Theme[]) {
        const out = join(dir, `${kebab(act.name)}-${t}.gif`)
        if ((await render(browser, act, t, fps, out)) > LIMIT && fps > FALLBACK_FPS) {
          console.log(`  over 3 MB: ${act.name} (${t}) again at ${FALLBACK_FPS} fps`)
          await render(browser, act, t, FALLBACK_FPS, out)
        }
      }
    }
  } else {
    const name = positional[0]
    const act = ACTS.find(a => a.name === name)
    if (!act) throw new Error(`no act named ${name ?? '(none given)'}; the acts are ${ACTS.map(a => a.name).join(', ')}`)
    await render(browser, act, theme, fps, resolve(flag('--out') ?? `${kebab(act.name)}-${theme}.gif`))
  }
} finally {
  await browser.quit()
}
