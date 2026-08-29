import { createServer } from 'node:http';

/**
 * Standalone process standing in for api.indexnow.org, so the golden-path run
 * doesn't depend on the real multi-engine endpoint. Always returns 200
 * (the "push accepted" case IndexNowProvider maps to SUBMITTED) — this suite
 * proves FoxIndex's own pipeline, not IndexNow's uptime.
 *
 * - POST /indexnow      records the body, returns 200
 * - GET  /__requests    returns all recorded request bodies as a JSON array
 * - GET  /__health      readiness probe for Playwright's webServer
 */
const PORT = Number(process.env.PORT ?? 4012);
const receivedRequests: unknown[] = [];

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/__health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  if (req.method === 'GET' && url.pathname === '/__requests') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(receivedRequests));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/indexnow') {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        receivedRequests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        // not what this fixture is testing
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[indexnow-mock-server] listening on http://127.0.0.1:${PORT}`);
});
