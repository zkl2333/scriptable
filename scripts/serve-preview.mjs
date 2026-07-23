import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const previewDir = resolve(rootDir, 'preview');
const imageDir = resolve(rootDir, 'image');
const distDir = resolve(rootDir, 'dist');
const port = Number(process.env.PREVIEW_PORT || 4175);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const resolveSafePath = (baseDir, pathname) => {
  const target = resolve(baseDir, `.${pathname}`);
  return relative(baseDir, target).startsWith('..') ? null : target;
};

const server = createServer(async (request, response) => {
  try {
    const requestURL = new URL(request.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(requestURL.pathname);
    const [baseDir, relativePath] = pathname.startsWith('/image/')
      ? [imageDir, pathname.slice('/image'.length)]
      : pathname.startsWith('/dist/')
        ? [distDir, pathname.slice('/dist'.length)]
        : [previewDir, pathname === '/' ? '/index.html' : pathname];
    const filePath = resolveSafePath(baseDir, relativePath);
    if (!filePath || !existsSync(filePath)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
    });
    response.end(content);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(String(error));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Preview available at http://127.0.0.1:${port}`);
});
