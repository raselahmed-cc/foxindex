import { createServer } from 'node:http';

/**
 * Standalone process (started as a Playwright `webServer`, not imported).
 * Stands in for what the product tells real users to do: host the IndexNow
 * key as a static text file. The test controls what's served via a small
 * control-plane endpoint rather than the filesystem, since that's simpler to
 * coordinate cross-platform between the Playwright test process and this
 * subprocess.
 *
 * - PUT  /__set?path=/<name>.txt   body = file contents to serve at that path
 * - GET  /<name>.txt               serves the last-set contents, 404 if unset
 * - GET  /__health                 readiness probe for Playwright's webServer
 */
const PORT = Number(process.env.PORT ?? 4011);
const files = new Map<string, string>();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/__health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/__set') {
    const path = url.searchParams.get('path');
    if (!path) {
      res.writeHead(400);
      res.end('missing ?path=');
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      files.set(path, Buffer.concat(chunks).toString('utf8'));
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (req.method === 'GET' && files.has(url.pathname)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(files.get(url.pathname));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[key-file-server] listening on http://127.0.0.1:${PORT}`);
});
