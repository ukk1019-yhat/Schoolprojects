/**
 * Tiny static file server for local play and browser tests.
 * Run directly with `npm start`, or import `startServer` from other tests.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export const createStaticServer = (root) =>
  createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      // Strip leading separators and normalize so `..` cannot escape root.
      const rel = normalize(p).replace(/^([/\\])+/, '');
      if (rel.startsWith('..')) throw new Error('outside root');
      const file = join(root, rel);
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
  });

export const startServer = (port, root = process.cwd()) =>
  new Promise((resolve) => {
    const server = createStaticServer(root);
    server.listen(port, () => resolve(server));
  });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 8080;
  const server = await startServer(port);
  console.log(`SPIDER HERO running at http://localhost:${port}/  (Ctrl+C to stop)`);
  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
}
