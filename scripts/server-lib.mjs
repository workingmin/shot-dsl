import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.shotdsl': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
}

export const createStaticServer = ({ root, port = 4173, host = '127.0.0.1' }) => {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`)
    const { pathname } = url
    if (pathname === '/' || pathname === '/storyboard') {
      response.writeHead(302, {
        Location: `/storyboard/${url.search}`,
        'Cache-Control': 'no-store'
      })
      response.end()
      return
    }
    const safePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, '')
    let filePath = join(root, safePath === '/' ? 'index.html' : safePath)
    try {
      const metadata = await stat(filePath)
      if (metadata.isDirectory()) filePath = join(filePath, 'index.html')
      response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
      createReadStream(filePath).pipe(response)
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found')
    }
  })
  server.listen(port, host, () => process.stdout.write(`Shot DSL: http://${host}:${port}/storyboard/\n`))
  return server
}
