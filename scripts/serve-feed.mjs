#!/usr/bin/env node
// Serves a folder over HTTPS for the hands-on update test (docs/releasing.md): latest.json and the
// update packages, from this machine only. The certificate is mkcert's, trusted by this machine.
// Only files directly in the folder are served.
//
// Usage: node scripts/serve-feed.mjs <folder> <cert.pem> <key.pem> [port]

import { createServer } from 'node:https'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

const [dir, cert, key, port = '8443'] = process.argv.slice(2)
if (!dir || !cert || !key) {
  console.error('usage: node scripts/serve-feed.mjs <folder> <cert.pem> <key.pem> [port]')
  process.exit(1)
}

createServer({ cert: readFileSync(cert), key: readFileSync(key) }, (req, res) => {
  const name = basename(decodeURIComponent(new URL(req.url, 'https://x').pathname))
  const file = join(dir, name)
  let ok = false
  try {
    ok = !!name && statSync(file).isFile()
  } catch {}
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${ok ? 200 : 404}`)
  if (!ok) return res.writeHead(404).end()
  res.writeHead(200, { 'content-type': name.endsWith('.json') ? 'application/json' : 'application/octet-stream' })
  createReadStream(file).pipe(res)
}).listen(Number(port), '127.0.0.1', () => console.log(`serving ${dir} at https://localhost:${port}/ (Ctrl+C stops)`))
