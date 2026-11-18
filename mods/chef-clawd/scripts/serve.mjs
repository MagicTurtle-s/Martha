// Serves the mod's preview.html on http://localhost:4317 for a browser that will
// not open local files. Write the page first (scripts/preview.ts).
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 4317)
const PAGE = new URL('../preview.html', import.meta.url)

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (path !== '/' && path !== '/preview.html') {
    res.writeHead(404).end('not found')
    return
  }
  try {
    const page = await readFile(PAGE)
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(page)
  } catch {
    res.writeHead(500).end('preview.html is missing: run scripts/preview.ts first')
  }
}).listen(PORT, '127.0.0.1', () => console.log(`http://localhost:${PORT}/`))
