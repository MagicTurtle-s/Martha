import type { EngineInterface, Register, Timer } from 'claude-code'

import { IDLE_H, IDLE_W, idleSvg } from './art'
import { place } from './beside'
import { WORK_H, WORK_W, programme, workingSvg } from './scene'
import { WORK_COLUMNS, idleFrame, programme as terminalProgramme, workingFrame, type Programme } from './terminal/chef'

const IDLE = idleSvg()

// The drawing for the prompt now running: a fresh shuffle for each prompt,
// kept while it runs so a redraw does not start it over.
let working: string | undefined

// The desktop app's light-mode background, eyedropped from the window. The
// band's own grey card is the app's and no prop reaches it; this fills inside.
const APP_BG = '#FCFCFB'

// Chef Clawd appears only in a session opened in the Martha checkout (or a
// folder inside it): a directory, at or above the session's, that holds
// Martha's skill file AND this repository's marketplace file naming
// `martha-meal-planning`. The skill file alone is not enough: a copy of the
// skill installed for the user (~/.claude/skills/martha) sits above every
// folder in the home directory.
const MARTHA_SKILL = '.claude/skills/martha/SKILL.md'
const MARKETPLACE = '.claude-plugin/marketplace.json'
const MARTHA_REPO = /"name"\s*:\s*"martha-meal-planning"/
let inMartha: Promise<boolean> | undefined

const findMartha = async ($: EngineInterface): Promise<boolean> => {
  const found = await $.fs.ancestors({ names: [MARTHA_SKILL] })
  for (const { dir } of found) {
    try {
      const text = await $.fs.read(`${dir}/${MARKETPLACE}`)
      if (typeof text === 'string' && MARTHA_REPO.test(text)) return true
    } catch {
      // No marketplace file there: not the checkout.
    }
  }
  return false
}

// The terminal draws him as a grid of half-block cells, one frame every
// eighth of a second while a prompt runs.
const FRAME_MS = 125
const KEY = 'chef'
type Run = { programme: Programme; startedAt: number; timer: Timer; denied: number }
let run: Run | undefined

const stop = () => {
  run?.timer.cancel()
  run = undefined
}

// Chef Clawd sits at the right end of the band above the prompt. While a
// turn runs, his kitchen appears and he stirs a pot, stepping away now and
// then for an act; when the turn ends he is back to idle at once. The desktop
// draws him in SVG (animated by the SVG itself), stirring the saucepan on the
// range; the terminal in pixels two to a cell, repainted by a timer, where a
// cauldron rises into view for him to stir.
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    inMartha = undefined
    stop()
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    stop()
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    inMartha ??= findMartha($).catch(() => false)

    if (e.props.hasSurvey || !(await inMartha)) {
      if (e.surface === 'terminal') stop()
      return next(e)
    }

    if (e.surface === 'terminal') {
      const { Box, Raster } = $.ui.resolve(e)
      const engine = await next(e)

      let frame
      if (!e.props.isWorking) {
        stop()
        frame = idleFrame()
      } else {
        // Too narrow for the working scene: the band stays the engine's, and
        // no timer runs to blit frames nobody can see.
        if (e.props.bodyColumns < WORK_COLUMNS) {
          stop()
          return engine
        }
        // Read the clock before looking at `run`: with no wait between the
        // look and the claim, two drawings at once cannot both start a timer.
        const now = await $.clock.now()
        if (!run) {
          const requestId = e.requestId
          const started: Run = {
            programme: terminalProgramme(),
            startedAt: now,
            denied: 0,
            timer: $.clock.every(FRAME_MS, async () => {
              // A timer that is no longer the running one stops itself.
              if (run !== started) return started.timer.cancel()
              const t = ((await $.clock.now()) - started.startedAt) / 1000
              const cells = workingFrame(started.programme, t).cells()
              // A blit that fails outright counts as one not shown.
              const result = await $.ui.blit({ requestId, key: KEY, cells }).catch(() => ({ deny: 'failed' }))
              // Not mounted for a while (the band was collapsed or put away):
              // let the timer go; the next drawing starts another.
              started.denied = result.deny ? started.denied + 1 : 0
              if (started.denied > 40 && run === started) stop()
            }),
          }
          run = started
        }
        frame = workingFrame(run.programme, (now - run.startedAt) / 1000)
      }

      // Too narrow for him: the band stays the engine's.
      if (e.props.bodyColumns < frame.columns) return engine

      // The engine's band (what the plugins beneath and the engine drew) may
      // not sit under a Box with layout props, so it and he are siblings.
      return (
        <>
          {engine ?? null}
          <Box width="100%" justifyContent="flex-end">
            <Raster key={KEY} columns={frame.columns} rows={frame.rows} cells={frame.cells()} />
          </Box>
        </>
      )
    }

    const { Box, Svg } = $.ui.resolve(e)
    const isWorking = e.props.isWorking
    if (!isWorking) working = undefined
    else working ??= workingSvg(programme())

    return (
      <Box width="100%" justifyContent="flex-end" backgroundColor={APP_BG}>
        <Svg
          source={working ?? IDLE}
          alt={isWorking ? 'Chef Clawd stirring a saucepan' : 'Chef Clawd with a ladle'}
          width={isWorking ? WORK_W : IDLE_W}
          height={isWorking ? WORK_H : IDLE_H}
          isInteractive
        />
      </Box>
    )
  })

  // In the terminal he sits beside the other mods' rows, not under them
  // (beside.ts). His own row is asked for only in the Martha checkout, so
  // elsewhere there is no row of his here and the band is left alone.
  on('ui.render', { component: 'AbovePromptList' }, async ($, e, next) => {
    const rows = e.props.rows
    const chef = rows.filter((r) => isChef(r.plugin))
    const rest = rows.filter((r) => !isChef(r.plugin))
    if (e.surface !== 'terminal' || e.props.hasSurvey || !chef.length || !rest.length) return next(e)
    const at = place(rest.map((r) => r.tree), e.props.bodyColumns)
    if (!at) return next({ ...e, props: { ...e.props, rows: rest } })
    const left = await next({ ...e, props: { ...e.props, rows: rest } })
    const right = await next({ ...e, props: { ...e.props, rows: chef } })
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box key="others" flexDirection="column" paddingRight={at.width}>
          {left}
        </Box>
        <Box key="chef" flexDirection="column" marginLeft={at.room} marginTop={-at.lift}>
          {right}
        </Box>
      </Box>
    )
  })
}

const isChef = (plugin: string) => plugin.split('@')[0] === 'chef-clawd'
