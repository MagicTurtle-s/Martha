// Lets Node load the mod's TypeScript as Claude Code does: an import with no
// extension ('./art') finds './art.ts'.
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const ext of ['.ts', '.tsx']) {
        try {
          return next(specifier + ext, context)
        } catch {}
      }
    }
    return next(specifier, context)
  },
})
