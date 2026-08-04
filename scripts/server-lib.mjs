import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jd': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.map': 'application/json; charset=utf-8',
  '.obj': 'text/plain; charset=utf-8',
  '.png': 'image/png'
}

const resolveRequestPath = (root, requestUrl) => {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname)
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1)
  const resolved = path.resolve(root, relativePath)
  const relative = path.relative(root, resolved)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }
  return resolved
}

export const startStaticServer = ({ root, port, host = '127.0.0.1' }) => {
  const server = http.createServer(async (request, response) => {
    const filepath = resolveRequestPath(root, request.url ?? '/')
    if (!filepath) {
      response.writeHead(403).end('Forbidden')
      return
    }

    try {
      const info = await stat(filepath)
      if (!info.isFile()) throw new Error('Not a file')

      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': info.size,
        'Content-Type': mimeTypes[path.extname(filepath)] ?? 'application/octet-stream'
      })
      createReadStream(filepath).pipe(response)
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found')
    }
  })

  server.listen(port, host, () => {
    process.stdout.write(`Shot DSL prototype: http://${host}:${port}\n`)
  })

  return server
}
